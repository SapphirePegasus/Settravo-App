/**
 * tripStore.ts
 *
 * Zustand store for trip state and the offline expense queue.
 *
 * Persistence strategy:
 *  - Trip ID list → AsyncStorage "settravo:joined_trip_ids"
 *  - Offline queue → AsyncStorage "settravo:offline_queue"
 *  - Dead-letter queue → AsyncStorage "settravo:dead_letter_queue"
 *  - Full trip objects are NOT persisted locally — re-fetched on launch.
 *    Only IDs are persisted so we know what to fetch.
 *
 * Offline queue integrity:
 *  - loadOfflineQueue validates each item with OfflineQueueItemSchema.
 *  - Invalid items are dropped to dead-letter rather than crashing the replay loop.
 *  - Items that fail OFFLINE_MAX_RETRIES times are moved to dead-letter.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { DeadLetterItem, OfflineQueueItem, Trip } from '../types/domain';
import { OfflineQueueItemSchema } from '../validation/schemas';

const JOINED_IDS_KEY = 'settravo:joined_trip_ids';
const OFFLINE_QUEUE_KEY = 'settravo:offline_queue';
const DEAD_LETTER_KEY = 'settravo:dead_letter_queue';

interface TripState {
    trips: Trip[];
    joinedTripIds: string[];
    isLoading: boolean;
    hasFetched: boolean;
    activeTripId: string | null;
    offlineQueue: OfflineQueueItem[];
    deadLetterQueue: DeadLetterItem[];

    setTrips: (trips: Trip[]) => void;
    addTrip: (trip: Trip) => Promise<void>;
    removeTrip: (tripId: string) => Promise<void>;
    setActiveTripId: (id: string | null) => void;
    setLoading: (loading: boolean) => void;
    setHasFetched: (v: boolean) => void;
    loadJoinedIds: () => Promise<void>;
    enqueueOfflineItem: (item: OfflineQueueItem) => Promise<void>;
    dequeueOfflineItem: (localId: string) => Promise<void>;
    /**
     * Increment retryCount and update lastFailedAt for an item.
     * Called by useOfflineSync when a replay attempt fails but hasn't
     * yet exceeded OFFLINE_MAX_RETRIES.
     */
    updateOfflineItemRetry: (localId: string, newRetryCount: number, failedAt: string) => Promise<void>;
    /**
     * Move a failed item from the live queue to the dead-letter queue.
     * Called by useOfflineSync when retryCount >= OFFLINE_MAX_RETRIES.
     */
    addDeadLetterItem: (item: DeadLetterItem) => Promise<void>;
    loadOfflineQueue: () => Promise<void>;
    loadDeadLetterQueue: () => Promise<void>;
}

export const useTripStore = create<TripState>((set, get) => ({
    trips: [],
    joinedTripIds: [],
    isLoading: false,
    hasFetched: false,
    activeTripId: null,
    offlineQueue: [],
    deadLetterQueue: [],

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

    updateOfflineItemRetry: async (localId, newRetryCount, failedAt) => {
        const { offlineQueue } = get();
        const newQueue = offlineQueue.map((item) =>
            item.localId === localId
                ? { ...item, retryCount: newRetryCount, lastFailedAt: failedAt }
                : item,
        );
        set({ offlineQueue: newQueue });
        await persistOfflineQueue(newQueue);
    },

    addDeadLetterItem: async (item) => {
        const { deadLetterQueue } = get();
        const newDL = [...deadLetterQueue, item];
        set({ deadLetterQueue: newDL });
        await persistDeadLetterQueue(newDL);
    },

    loadOfflineQueue: async () => {
        try {
            const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
            if (!raw) return;

            const parsed: unknown[] = JSON.parse(raw);
            const valid: OfflineQueueItem[] = [];
            const dropped: unknown[] = [];

            for (const entry of parsed) {
                const result = OfflineQueueItemSchema.safeParse(entry);
                if (result.success) {
                    valid.push(result.data as OfflineQueueItem);
                } else {
                    console.warn(
                        '[tripStore] Dropped invalid offline queue entry:',
                        result.error.flatten(),
                    );
                    dropped.push(entry);
                }
            }

            set({ offlineQueue: valid });

            // Re-persist only valid items to clean up any corruption
            if (dropped.length > 0) {
                await persistOfflineQueue(valid);
            }
        } catch (err) {
            console.warn('[tripStore] Failed to load offline queue:', err);
            // On total parse failure, reset queue to prevent the app from
            // being permanently stuck
            set({ offlineQueue: [] });
            await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
        }
    },

    loadDeadLetterQueue: async () => {
        try {
            const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
            if (raw) {
                const items: DeadLetterItem[] = JSON.parse(raw);
                set({ deadLetterQueue: items });
            }
        } catch (err) {
            console.warn('[tripStore] Failed to load dead-letter queue:', err);
        }
    },
}));

export function selectActiveTrip(state: TripState): Trip | null {
    if (!state.activeTripId) return null;
    return state.trips.find((t) => t.id === state.activeTripId) ?? null;
}

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

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

async function persistDeadLetterQueue(items: DeadLetterItem[]): Promise<void> {
    try {
        await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(items));
    } catch (err) {
        console.error('[tripStore] Failed to persist dead-letter queue:', err);
    }
}