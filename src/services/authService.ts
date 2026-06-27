/**
 * authService.ts
 *
 * Handles the complete anonymous identity lifecycle.
 *
 * Offline-first boot strategy:
 *  - User profile (DeviceUser) is cached in SecureStore as JSON.
 *  - On boot, if a Supabase session exists in local storage AND a cached
 *    profile exists, we return the cached profile immediately — no network
 *    call required. This makes the app fully functional offline on relaunch.
 *  - A background refresh from Supabase runs after boot to sync the profile.
 *  - Only on true first launch (no session, no cache) is a network call required.
 *
 * Security model:
 *  - The Supabase JWT is the auth token. All RLS policies check auth.uid().
 *  - Device UUID in SecureStore is a secondary binding.
 *  - We never poll supabase.auth.getUser() — that interferes with the SDK's
 *    internal token refresh cycle.
 */

import * as SecureStore from 'expo-secure-store';
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full initialization sequence. Returns DeviceUser on success.
 *
 * Offline-first: if a session + cached profile both exist, returns the
 * cached profile immediately without any network call. Background-refreshes
 * the profile from the DB afterwards.
 *
 * Network-required: only on true first launch (no persisted session).
 */
export async function initializeDeviceIdentity(): Promise<DeviceUser> {
    // Step 1: Check for an existing local session (reads from SDK's AsyncStorage — no network)
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;

    if (session) {
        // Returning user — try the cache first for offline-safe boot
        const cached = await readCachedUser();
        if (cached && cached.id === session.user.id) {
            // Serve cached immediately. Background-refresh profile from DB.
            refreshProfileInBackground(session.user.id);
            return cached;
        }
        // Cache miss or stale — fall through to network fetch
    } else {
        // First launch or session was cleared — network required
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
            throw new Error(
                `[authService] signInAnonymously failed: ${error?.message ?? 'no session returned'}`,
            );
        }
        session = data.session;
    }

    const authUid = session.user.id;

    // Step 2: Ensure SecureStore UUID exists
    let storedUuid = await SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY);

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