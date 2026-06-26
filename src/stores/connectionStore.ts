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

/**
 * connectionStore.ts
 *
 * Tracks network connectivity and Supabase Realtime channel health.
 *
 * Key fix: realtimeStatus 'disconnected' means "no channel is mounted" —
 * this is the correct idle state on the home screen and should NOT trigger
 * the banner. The banner only appears when:
 *   - networkOnline is false (offline banner), OR
 *   - a channel IS mounted (channelMounted=true) but realtimeStatus is not
 *     'connected' (reconnecting banner).
 */

import { create } from 'zustand';
import type { ConnectionStatus } from '../types/domain';

interface ConnectionState {
    networkOnline: boolean;
    realtimeStatus: 'connected' | 'reconnecting' | 'disconnected';
    /** True while a realtime channel for a trip is actively mounted. */
    channelMounted: boolean;
    connectionStatus: ConnectionStatus;

    setNetworkOnline: (online: boolean) => void;
    setRealtimeStatus: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
    setChannelMounted: (mounted: boolean) => void;
}

function deriveStatus(
    networkOnline: boolean,
    realtimeStatus: 'connected' | 'reconnecting' | 'disconnected',
    channelMounted: boolean,
): ConnectionStatus {
    if (!networkOnline) return 'offline';
    // Only show reconnecting if we actually expect a channel to be up
    if (channelMounted && realtimeStatus !== 'connected') return 'reconnecting';
    return 'connected';
}

export const useConnectionStore = create<ConnectionState>((set) => ({
    networkOnline: true,
    realtimeStatus: 'disconnected',
    channelMounted: false,
    connectionStatus: 'connected',

    setNetworkOnline: (online) =>
        set((state) => ({
            networkOnline: online,
            connectionStatus: deriveStatus(online, state.realtimeStatus, state.channelMounted),
        })),

    setRealtimeStatus: (status) =>
        set((state) => ({
            realtimeStatus: status,
            connectionStatus: deriveStatus(state.networkOnline, status, state.channelMounted),
        })),

    setChannelMounted: (mounted) =>
        set((state) => ({
            channelMounted: mounted,
            connectionStatus: deriveStatus(state.networkOnline, state.realtimeStatus, mounted),
        })),
}));