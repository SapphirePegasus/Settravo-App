/**
 * connectionStore.ts
 *
 * Tracks network connectivity, Supabase Realtime channel health, and
 * (Phase 3) whether the offline queue is actively replaying.
 *
 * Concepts:
 *  - networkOnline: is the device connected to the internet?
 *    Driven by @react-native-community/netinfo.
 *  - realtimeStatus: is the Supabase Realtime channel alive?
 *    Driven by the realtimeService. 'disconnected' means "no channel is
 *    mounted" — the correct idle state on the home screen; the reconnecting
 *    banner only appears when a channel IS mounted but not connected.
 *  - isSyncing: the offline queue replay loop is running (Phase 3 —
 *    drives the "Syncing…" state of SyncStatusBanner).
 */

import { create } from 'zustand';
import type { ConnectionStatus } from '../types/domain';

interface ConnectionState {
    networkOnline: boolean;
    realtimeStatus: 'connected' | 'reconnecting' | 'disconnected';
    /** True while a realtime channel for a trip is actively mounted. */
    channelMounted: boolean;
    /** True while the offline queue replay loop is running. */
    isSyncing: boolean;
    connectionStatus: ConnectionStatus;

    setNetworkOnline: (online: boolean) => void;
    setRealtimeStatus: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
    setChannelMounted: (mounted: boolean) => void;
    setSyncing: (syncing: boolean) => void;
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
    isSyncing: false,
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

    setSyncing: (syncing) => set({ isSyncing: syncing }),
}));