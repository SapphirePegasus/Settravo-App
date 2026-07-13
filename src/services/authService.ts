/**
 * authService.ts
 *
 * Handles the complete anonymous identity lifecycle.
 *
 * ── Phase-3 offline boot contract ───────────────────────────────────────────
 * The previous flow had two paths that killed offline boot:
 *   1. session + SecureStore cache MISS → fell through to fetchUserRow()
 *      (network) → threw offline → "Unable to start".
 *   2. no session + offline → signInAnonymously() threw a raw error with no
 *      way for the UI to distinguish "needs internet once" from a real bug.
 *
 * New guarantees:
 *   - If ANY session exists, initializeDeviceIdentity() NEVER throws.
 *     Fallback chain: SecureStore cache → network fetch → minimal profile
 *     derived from the session itself (background-refreshed later).
 *   - True first launch with no network throws AppError('NETWORK') so the
 *     root layout can show a friendly "connect once to get started" screen
 *     with a Retry button instead of a dead end.
 *
 * Security model (unchanged):
 *  - The Supabase JWT is the auth token. All RLS policies check auth.uid().
 *  - Device UUID in SecureStore is a secondary binding.
 *  - We never poll supabase.auth.getUser() — that interferes with the SDK's
 *    internal token refresh cycle.
 */

import * as SecureStore from 'expo-secure-store';
import { AppError } from '../errors/AppError';
import { clearLocalCache } from '../lib/localCache';
import { supabase } from '../lib/supabase';
import type { DeviceUser } from '../types/domain';
import type { Database } from '../types/supabase';
import { RegisterDeviceSchema, DeviceUserCacheSchema } from '../validation/schemas';

type UserRow = Database['public']['Tables']['TravelAppUsers']['Row'];

const SECURE_DEVICE_UUID_KEY = 'settravo_device_uuid';
const SECURE_USER_CACHE_KEY = 'settravo_user_cache';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapRowToDomain(row: UserRow): DeviceUser {
    return {
        id: row.id,
        deviceUuid: row.device_uuid,
        displayName: row.display_name,
        avatarColor: row.avatar_color,
        createdAt: row.created_at,
        lastSeen: row.last_seen,
    };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function writeCachedUser(user: DeviceUser): Promise<void> {
    try {
        await SecureStore.setItemAsync(SECURE_USER_CACHE_KEY, JSON.stringify(user));
    } catch {
        // Non-fatal — cache is best-effort
    }
}

async function readCachedUser(): Promise<DeviceUser | null> {
    try {
        const raw = await SecureStore.getItemAsync(SECURE_USER_CACHE_KEY);
        if (!raw) return null;

        // Security: never trust raw JSON from SecureStore without schema validation.
        // Corrupted or tampered cache entries are evicted rather than accepted.
        const result = DeviceUserCacheSchema.safeParse(JSON.parse(raw));
        if (!result.success) {
            console.warn(
                '[authService] SecureStore cache failed validation — evicting.',
                result.error.flatten(),
            );
            await SecureStore.deleteItemAsync(SECURE_USER_CACHE_KEY);
            return null;
        }
        return result.data;
    } catch {
        // JSON.parse failure or SecureStore read error — treat as cache miss
        await SecureStore.deleteItemAsync(SECURE_USER_CACHE_KEY).catch(() => { });
        return null;
    }
}

/** Heuristic: does this error look like a connectivity failure? */
function isNetworkError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return (
        msg.includes('network request failed') ||
        msg.includes('failed to fetch') ||
        msg.includes('fetch failed') ||
        msg.includes('network error') ||
        msg.includes('timeout') ||
        msg.includes('abort')
    );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full initialization sequence. Returns DeviceUser on success.
 *
 * NEVER throws when a session exists (offline-safe relaunch).
 * Throws AppError('NETWORK') only on true first launch without internet.
 */
export async function initializeDeviceIdentity(): Promise<DeviceUser> {
    // Step 1: Check for an existing local session (reads from SDK storage — no network)
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;

    if (session) {
        // Returning user — cache first, for offline-safe boot.
        const cached = await readCachedUser();
        if (cached && cached.id === session.user.id) {
            refreshProfileInBackground(session.user.id);
            return cached;
        }

        // Cache miss or stale: TRY the network, but never let it kill boot —
        // the session proves who this device is.
        try {
            const row = await fetchUserRow(session.user.id);
            if (row) {
                const user = mapRowToDomain(row);
                await writeCachedUser(user);
                if (!(await SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY))) {
                    await SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, row.device_uuid);
                }
                void supabase
                    .from('TravelAppUsers')
                    .update({ last_seen: new Date().toISOString() })
                    .eq('id', session.user.id);
                return user;
            }
            // Session exists but no user row (row was deleted server-side):
            // fall through to the create path below — requires network, but
            // we ARE online (fetch just succeeded).
        } catch (err) {
            if (isNetworkError(err)) {
                // OFFLINE with a valid session and no cache: serve a minimal
                // profile derived from the session. Real data loads later.
                const storedUuid = await SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY);
                const nowIso = new Date().toISOString();
                const minimal: DeviceUser = {
                    id: session.user.id,
                    deviceUuid: storedUuid ?? session.user.id,
                    displayName: null,
                    avatarColor: null,
                    createdAt: session.user.created_at ?? nowIso,
                    lastSeen: nowIso,
                    // Signals the auth gate: this user IS onboarded (they have
                    // a session) — we just can't read their profile offline.
                    // Never written to the SecureStore cache.
                    isProvisional: true,
                };
                refreshProfileWhenPossible(session.user.id);
                return minimal;
            }
            throw err; // Non-network failure with a live session — surface it.
        }
    } else {
        // First launch or session was cleared — network required, once.
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
            if (error && isNetworkError(error)) {
                throw new AppError(
                    'NETWORK',
                    'Settravo needs an internet connection the first time you open it.',
                    error,
                );
            }
            throw new Error(
                `[authService] signInAnonymously failed: ${error?.message ?? 'no session returned'}`,
            );
        }
        session = data.session;
    }

    const authUid = session.user.id;

    // Step 2: Ensure SecureStore UUID exists
    const storedUuid = await SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY);

    // Step 3: Fetch or create TravelAppUsers row
    const existingUser = await fetchUserRow(authUid);

    if (existingUser) {
        if (!storedUuid) {
            await SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, existingUser.device_uuid);
        }
        // Update last_seen (best-effort, never blocks)
        void supabase
            .from('TravelAppUsers')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', authUid);

        const user = mapRowToDomain(existingUser);
        await writeCachedUser(user);
        return user;
    }

    // Step 4: First-ever sign in — create the user record
    const deviceUuid = authUid;
    RegisterDeviceSchema.parse({ deviceUuid });

    const { data: newUser, error: insertError } = await supabase
        .from('TravelAppUsers')
        .insert({
            id: authUid,
            device_uuid: deviceUuid,
            display_name: null,
            avatar_color: null,
        })
        .select()
        .single();

    if (insertError || !newUser) {
        throw new Error(`[authService] Failed to create user record: ${insertError?.message}`);
    }

    await SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, deviceUuid);
    const user = mapRowToDomain(newUser);
    await writeCachedUser(user);
    return user;
}

/**
 * Update the display name for the current device user.
 * Writes through to the cache on success.
 */
export async function updateDisplayName(
    userId: string,
    displayName: string,
): Promise<DeviceUser> {
    const validated = RegisterDeviceSchema.shape.displayName.parse(displayName);

    const { data, error } = await supabase
        .from('TravelAppUsers')
        .update({ display_name: validated })
        .eq('id', userId)
        .select()
        .single();

    if (error || !data) {
        throw new Error(`[authService] Failed to update display name: ${error?.message}`);
    }

    const user = mapRowToDomain(data);
    await writeCachedUser(user);
    return user;
}

export async function getStoredDeviceUuid(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY);
}

export async function signOutAndReset(): Promise<void> {
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync(SECURE_DEVICE_UUID_KEY);
    await SecureStore.deleteItemAsync(SECURE_USER_CACHE_KEY);
    // Money data must not survive a sign-out on a shared device.
    clearLocalCache();
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchUserRow(authUid: string): Promise<UserRow | null> {
    const { data, error } = await supabase
        .from('TravelAppUsers')
        .select('*')
        .eq('id', authUid)
        .maybeSingle();

    if (error) throw new Error(`[authService] Failed to fetch user row: ${error.message}`);
    return data;
}

/**
 * Silently refresh profile from DB and update the cache.
 * Called after a cache-hit boot. Never throws — errors are swallowed.
 */
function refreshProfileInBackground(authUid: string): void {
    fetchUserRow(authUid)
        .then(async (row) => {
            if (!row) return;
            const user = mapRowToDomain(row);
            await writeCachedUser(user);
            // Also update last_seen
            void supabase
                .from('TravelAppUsers')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', authUid);
            // Patch the live authStore so display name stays fresh
            // (imported lazily to avoid circular dep at module level)
            const { useAuthStore } = await import('../stores/authStore');
            const current = useAuthStore.getState().deviceUser;
            if (current && current.id === authUid) {
                // Only patch if something actually changed
                if (
                    current.displayName !== user.displayName ||
                    current.avatarColor !== user.avatarColor
                ) {
                    useAuthStore.setState({ deviceUser: user });
                }
            }
        })
        .catch((err) => {
            console.warn('[authService] Background profile refresh failed:', err);
        });
}

/**
 * Retry the profile fetch every 20s until it succeeds once — used after a
 * minimal-profile offline boot so the real display name appears as soon as
 * connectivity returns, without the user doing anything.
 */
function refreshProfileWhenPossible(authUid: string): void {
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // ~10 minutes, then give up until next launch

    const tick = (): void => {
        attempts += 1;
        fetchUserRow(authUid)
            .then(async (row) => {
                if (!row) return; // row genuinely absent — nothing to restore
                const user = mapRowToDomain(row);
                await writeCachedUser(user);
                const { useAuthStore } = await import('../stores/authStore');
                const current = useAuthStore.getState().deviceUser;
                if (current && current.id === authUid) {
                    useAuthStore.setState({ deviceUser: user });
                }
            })
            .catch(() => {
                if (attempts < MAX_ATTEMPTS) {
                    setTimeout(tick, 20_000);
                }
            });
    };

    setTimeout(tick, 5_000);
}