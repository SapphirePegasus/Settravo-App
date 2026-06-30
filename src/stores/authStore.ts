/**
 * authStore.ts
 *
 * Zustand store for device identity state.
 *
 * This is the single source of truth for "who is this device".
 * All other stores and screens read from here — they never call authService
 * directly (except via the actions exposed here).
 *
 * State lifecycle:
 *  isReady: false → initializeIdentity() → isReady: true
 *  The root layout waits on isReady before rendering any screen.
 *
 * Important: do NOT persist this store with zustand/middleware/persist.
 * The Supabase session is persisted by the SDK via the localStorage polyfill.
 * Duplicating it in Zustand causes double-restore conflicts.
 */

import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { initializeDeviceIdentity, updateDisplayName } from '../services/authService';
import type { DeviceUser } from '../types/domain';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
    /** True once initializeIdentity() has completed (success or failure). */
    isReady: boolean;
    /** Null if not yet initialized or sign-in failed. */
    deviceUser: DeviceUser | null;
    /** Active Supabase session. Null before first sign-in. */
    session: Session | null;
    /** Error from the last initialization attempt. */
    initError: string | null;

    // Actions
    initializeIdentity: () => Promise<void>;
    setDisplayName: (name: string) => Promise<void>;
    setSession: (session: Session | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
    isReady: false,
    deviceUser: null,
    session: null,
    initError: null,

    /**
     * Run the full identity initialization sequence.
     * Call once from the root layout's useEffect.
     * Safe to call multiple times — subsequent calls are no-ops if already ready.
     */
    initializeIdentity: async () => {
        if (get().isReady) {
            return;
        }

        try {
            const deviceUser = await initializeDeviceIdentity();
            set({ deviceUser, isReady: true, initError: null });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown auth error';
            console.error('[authStore]', message);
            set({ isReady: true, initError: message });
        }
    },

    /**
     * Update the display name for the current user.
     * Throws if not initialized or update fails.
     */
    setDisplayName: async (name: string) => {
        const { deviceUser } = get();
        if (!deviceUser) {
            throw new Error('[authStore] Cannot set display name — no device user');
        }

        const updated = await updateDisplayName(deviceUser.id, name);
        set({ deviceUser: updated });
    },

    /**
     * Called by the onAuthStateChange listener in the root layout.
     * Keeps the session in sync with Supabase's internal token refresh.
     */
    setSession: (session: Session | null) => {
        set({ session });
    },
}));

// ─── Auth state change subscription ──────────────────────────────────────────

/**
 * Subscribe to Supabase auth state changes.
 * Call once from the root layout. The unsubscribe function must be called
 * on unmount (though the root layout never actually unmounts in Expo Router).
 *
 * This is the ONLY place we read from onAuthStateChange.
 * Do not add more subscribers elsewhere — multiple listeners create race conditions.
 */
export function subscribeToAuthChanges(): () => void {
    const { data: subscription } = supabase.auth.onAuthStateChange(
        (_event, session) => {
            useAuthStore.getState().setSession(session);
        },
    );

    return () => {
        subscription.subscription.unsubscribe();
    };
}