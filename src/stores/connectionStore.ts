/**
 * connectionStore.ts
 *
 * Tracks network connectivity and Supabase Realtime channel health.
 *
 * Two separate concepts:
 *  - networkOnline: is the device connected to the internet?
 *    Driven by @react-native-community/netinfo.
 *  - realtimeStatus: is the Supabase Realtime channel alive?
 *    Driven by the realtimeService (Phase 3).
 *
 * The UI uses `connectionStatus` (the derived combination) to decide
 * whether to show the ConnectionBanner ("reconnecting…").
 */

import { create } from 'zustand';
import type { ConnectionStatus } from '../types/domain';

interface ConnectionState {
    networkOnline: boolean;
    realtimeStatus: 'connected' | 'reconnecting' | 'disconnected';

    /** Derived: the status the UI should display. */
    connectionStatus: ConnectionStatus;

    // Actions
    setNetworkOnline: (online: boolean) => void;
    setRealtimeStatus: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
}

function deriveStatus(
    networkOnline: boolean,
    realtimeStatus: 'connected' | 'reconnecting' | 'disconnected',
): ConnectionStatus {
    if (!networkOnline) return 'offline';
    if (realtimeStatus === 'connected') return 'connected';
    return 'reconnecting';
}

export const useConnectionStore = create<ConnectionState>((set) => ({
    networkOnline: true,
    realtimeStatus: 'connected',
    connectionStatus: 'connected',

    setNetworkOnline: (online) =>
        set((state) => {
            const connectionStatus = deriveStatus(online, state.realtimeStatus);
            return { networkOnline: online, connectionStatus };
        }),

    setRealtimeStatus: (status) =>
        set((state) => {
            const connectionStatus = deriveStatus(state.networkOnline, status);
            return { realtimeStatus: status, connectionStatus };
        }),
}));