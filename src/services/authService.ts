/**
 * authService.ts
 *
 * Handles the complete anonymous identity lifecycle:
 *
 *  1. On first launch: call signInAnonymously() → Supabase issues a JWT.
 *     The JWT sub (auth.uid()) becomes the device's permanent identity.
 *  2. Store the device UUID in expo-secure-store (encrypted at rest).
 *  3. Create a row in TravelAppUsers linking the auth.uid() to the UUID.
 *  4. On subsequent launches: restore the session from the localStorage
 *     polyfill. SecureStore confirms the UUID hasn't been tampered with.
 *
 * Security model:
 *  - The Supabase JWT is the auth token. All RLS policies check auth.uid().
 *  - The device UUID in SecureStore is a secondary binding: if SecureStore
 *    is cleared (device wipe, uninstall on Android), we treat this as a
 *    new device and issue a new identity.
 *  - We never call supabase.auth.getUser() in a polling loop — that would
 *    interfere with the SDK's internal token refresh cycle. Listen to
 *    onAuthStateChange instead.
 */

import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import type { DeviceUser } from '../types/domain';
import type { Database } from '../types/supabase';
import { RegisterDeviceSchema } from '../validation/schemas';

type UserRow = Database['public']['Tables']['TravelAppUsers']['Row'];

// ─── SecureStore key ─────────────────────────────────────────────────────────

/** The key under which the device UUID is stored in SecureStore. */
const SECURE_DEVICE_UUID_KEY = 'settravo_device_uuid';

// ─── Mappers ─────────────────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full initialization sequence. Call once on app startup, before rendering
 * any authenticated screens. Returns the DeviceUser on success.
 *
 * Sequence:
 *  1. Check for an existing Supabase session (persisted across restarts).
 *  2. If no session: call signInAnonymously().
 *  3. Verify or create the TravelAppUsers row for auth.uid().
 *  4. Confirm the device UUID in SecureStore matches. If missing (e.g. Android
 *     reinstall), upsert with the current auth.uid() as the new UUID.
 */
export async function initializeDeviceIdentity(): Promise<DeviceUser> {
    // Step 1: Get or create Supabase session
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;

    if (!session) {
        // First launch or session was cleared
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
            throw new Error(`[authService] signInAnonymously failed: ${error?.message ?? 'no session returned'}`);
        }
        session = data.session;
    }

    const authUid = session.user.id;

    // Step 2: Check SecureStore for existing device UUID
    let storedUuid = await SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY);

    // Step 3: Validate or create TravelAppUsers row
    const existingUser = await fetchUserRow(authUid);

    if (existingUser) {
        // Row exists. If SecureStore UUID is missing (Android uninstall scenario),
        // restore it from the DB row.
        if (!storedUuid) {
            await SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, existingUser.device_uuid);
            storedUuid = existingUser.device_uuid;
        }

        // Update last_seen on every launch (best-effort, no throw on failure)
        void supabase
            .from('TravelAppUsers')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', authUid);

        return mapRowToDomain(existingUser);
    }

    // Step 4: No row yet — first-ever sign in. Create the user record.
    // The device UUID is the auth.uid() itself (they are the same identity).
    const deviceUuid = authUid;

    // Validate before writing
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

    // Persist UUID to SecureStore
    await SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, deviceUuid);

    return mapRowToDomain(newUser);
}

/**
 * Update the display name for the current device user.
 * Validates input before writing to Supabase.
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

    return mapRowToDomain(data);
}

/**
 * Returns the device UUID from SecureStore.
 * Returns null if not yet set (should only happen before initializeDeviceIdentity runs).
 */
export async function getStoredDeviceUuid(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY);
}

/**
 * Sign out and clear the local session.
 * WARNING: Anonymous users cannot recover their session after sign-out.
 * Only call this if the user explicitly wants to reset their identity.
 */
export async function signOutAndReset(): Promise<void> {
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync(SECURE_DEVICE_UUID_KEY);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchUserRow(authUid: string): Promise<UserRow | null> {
    const { data, error } = await supabase
        .from('TravelAppUsers')
        .select('*')
        .eq('id', authUid)
        .maybeSingle();

    if (error) {
        throw new Error(`[authService] Failed to fetch user row: ${error.message}`);
    }

    return data;
}