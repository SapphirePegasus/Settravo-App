/**
 * tripStore.ts
 *
 * Zustand store for trip state and the offline expense queue.
 *
 * Persistence strategy:
 *  - Trip ID list → AsyncStorage "settravo:joined_trip_ids"
 *  - Offline queue → AsyncStorage "settravo:offline_queue"
 *  - Full trip objects are NOT persisted locally — re-fetched on launch.
 *    Only IDs are persisted so we know what to fetch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { OfflineQueueItem, Trip } from '../types/domain';

const JOINED_IDS_KEY = 'settravo:joined_trip_ids';
const OFFLINE_QUEUE_KEY = 'settravo:offline_queue';

interface TripState {
    trips: Trip[];
    joinedTripIds: string[];
    isLoading: boolean;
    hasFetched: boolean;
    activeTripId: string | null;
    offlineQueue: OfflineQueueItem[];

    setTrips: (trips: Trip[]) => void;
    addTrip: (trip: Trip) => Promise<void>;
    removeTrip: (tripId: string) => Promise<void>;
    setActiveTripId: (id: string | null) => void;
    setLoading: (loading: boolean) => void;
    setHasFetched: (v: boolean) => void;
    loadJoinedIds: () => Promise<void>;
    enqueueOfflineItem: (item: OfflineQueueItem) => Promise<void>;
    dequeueOfflineItem: (localId: string) => Promise<void>;
    loadOfflineQueue: () => Promise<void>;
}

export const useTripStore = create<TripState>((set, get) => ({
    trips: [],
    joinedTripIds: [],
    isLoading: false,
    hasFetched: false,
    activeTripId: null,
    offlineQueue: [],

    setTrips: (trips) => set({ trips }),

    addTrip: async (trip) => {
        const { joinedTripIds, trips } = get();
        if (joinedTripIds.includes(trip.id)) return;
        const newIds = [...joinedTripIds, trip.id];
        const newTrips = [...trips, trip];
        set({ joinedTripIds: newIds, trips: newTrips });
        await persistJoinedIds(newIds);
    },

    removeTrip: async (tripId) => {
        const { joinedTripIds, trips } = get();
        const newIds = joinedTripIds.filter((id) => id !== tripId);
        const newTrips = trips.filter((t) => t.id !== tripId);
        set({ joinedTripIds: newIds, trips: newTrips });
        await persistJoinedIds(newIds);
    },

    setActiveTripId: (id) => set({ activeTripId: id }),
    setLoading: (loading) => set({ isLoading: loading }),
    setHasFetched: (v) => set({ hasFetched: v }),

    loadJoinedIds: async () => {
        try {
            const raw = await AsyncStorage.getItem(JOINED_IDS_KEY);
            if (raw) {
                const ids: string[] = JSON.parse(raw);
                set({ joinedTripIds: ids });
            }
        } catch (err) {
            console.warn('[tripStore] Failed to load joined IDs:', err);
        }
    },

    enqueueOfflineItem: async (item) => {
        const { offlineQueue } = get();
        const newQueue = [...offlineQueue, item];
        set({ offlineQueue: newQueue });
        await persistOfflineQueue(newQueue);
    },

    dequeueOfflineItem: async (localId) => {
        const { offlineQueue } = get();
        const newQueue = offlineQueue.filter((i) => i.localId !== localId);
        set({ offlineQueue: newQueue });
        await persistOfflineQueue(newQueue);
    },

    loadOfflineQueue: async () => {
        try {
            const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
            if (raw) {
                const queue: OfflineQueueItem[] = JSON.parse(raw);
                set({ offlineQueue: queue });
            }
        } catch (err) {
            console.warn('[tripStore] Failed to load offline queue:', err);
        }
    },
}));

export function selectActiveTrip(state: TripState): Trip | null {
    if (!state.activeTripId) return null;
    return state.trips.find((t) => t.id === state.activeTripId) ?? null;
}

async function persistJoinedIds(ids: string[]): Promise<void> {
    try {
        await AsyncStorage.setItem(JOINED_IDS_KEY, JSON.stringify(ids));
    } catch (err) {
        console.error('[tripStore] Failed to persist joined IDs:', err);
    }
}

async function persistOfflineQueue(queue: OfflineQueueItem[]): Promise<void> {
    try {
        await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
        console.error('[tripStore] Failed to persist offline queue:', err);
    }
}