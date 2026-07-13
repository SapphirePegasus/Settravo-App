/**
 * tripStore.ts
 *
 * Zustand store for trip state and the offline mutation queue.
 *
 * Phase-3 persistence strategy:
 *  - Full trip objects → SQLite local cache (write-through in setTrips /
 *    addTrip, hydrated by hydrateTripsFromCache on boot). The old
 *    "IDs only, refetch everything" model is what made offline launches empty.
 *  - Trip ID list → AsyncStorage (kept for backwards compatibility and as a
 *    lightweight signal of membership).
 *  - Offline queue + dead-letter queue → AsyncStorage (unchanged, validated
 *    with OfflineQueueItemSchema on load).
 *
 * Phase-3 dead-letter UX:
 *  - retryDeadLetterItem: moves an item back into the live queue with a
 *    fresh retry budget (user-initiated from the sync banner).
 *  - discardDeadLetterItem: drops it permanently (user acknowledged).
 *    Failed syncs are now VISIBLE and actionable, never silent.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { cacheExpenseWithSplits, cacheTrip, cacheTrips, readCachedTrips, removeCachedTrip } from '../lib/localCache';
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
    /** True once trips were hydrated from the local cache this session. */
    hasHydratedFromCache: boolean;
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
    /** Instant offline hydration from SQLite — call before any network fetch. */
    hydrateTripsFromCache: () => void;
    enqueueOfflineItem: (item: OfflineQueueItem) => Promise<void>;
    dequeueOfflineItem: (localId: string) => Promise<void>;
    updateOfflineItemRetry: (localId: string, newRetryCount: number, failedAt: string) => Promise<void>;
    addDeadLetterItem: (item: DeadLetterItem) => Promise<void>;
    /** Move a dead-letter item back to the live queue with a fresh retry budget. */
    retryDeadLetterItem: (localId: string) => Promise<void>;
    /** Permanently drop a dead-letter item (user acknowledged the failure). */
    discardDeadLetterItem: (localId: string) => Promise<void>;
    loadOfflineQueue: () => Promise<void>;
    loadDeadLetterQueue: () => Promise<void>;
}

export const useTripStore = create<TripState>((set, get) => ({
    trips: [],
    joinedTripIds: [],
    isLoading: false,
    hasFetched: false,
    hasHydratedFromCache: false,
    activeTripId: null,
    offlineQueue: [],
    deadLetterQueue: [],

    setTrips: (trips) => {
        set({ trips });
        // Write-through: the cache always mirrors the last known-good list.
        cacheTrips(trips);
    },

    addTrip: async (trip) => {
        const { joinedTripIds, trips } = get();
        if (joinedTripIds.includes(trip.id)) return;
        const newIds = [...joinedTripIds, trip.id];
        const newTrips = [...trips, trip];
        set({ joinedTripIds: newIds, trips: newTrips });
        cacheTrip(trip);
        await persistJoinedIds(newIds);
    },

    removeTrip: async (tripId) => {
        const { joinedTripIds, trips } = get();
        const newIds = joinedTripIds.filter((id) => id !== tripId);
        const newTrips = trips.filter((t) => t.id !== tripId);
        set({ joinedTripIds: newIds, trips: newTrips });
        removeCachedTrip(tripId);
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

    hydrateTripsFromCache: () => {
        if (get().hasHydratedFromCache) return;
        const cached = readCachedTrips();
        set((s) => ({
            hasHydratedFromCache: true,
            // Never clobber fresher network data with the cache: only apply
            // when the in-memory list is still empty.
            trips: s.trips.length === 0 ? cached : s.trips,
        }));
    },

    enqueueOfflineItem: async (item) => {
        const { offlineQueue } = get();
        const newQueue = [...offlineQueue, item];
        set({ offlineQueue: newQueue });

        // Write-through for offline adds: reconstruct the optimistic expense
        // (same shape the screen inserted into expenseStore) into the SQLite
        // cache under its localId, so it SURVIVES an app relaunch while
        // offline. useOfflineSync swaps localId → server row on replay.
        if (item.type === 'ADD_EXPENSE') {
            const nowIso = new Date().toISOString();
            cacheExpenseWithSplits(
                item.payload.tripId,
                {
                    id: item.localId,
                    tripId: item.payload.tripId,
                    paidByMember: item.payload.paidByMember,
                    title: item.payload.title,
                    category: item.payload.category ?? null,
                    amountMoney: item.payload.amountMoney,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    isPendingSync: true,
                },
                item.splits.map((s, i) => ({
                    id: `${item.localId}:${i}`,
                    expenseId: item.localId,
                    memberId: s.memberId,
                    shareMoney: s.shareMoney,
                    isSettled: false,
                })),
            );
        }

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

    retryDeadLetterItem: async (localId) => {
        const { deadLetterQueue, offlineQueue } = get();
        const item = deadLetterQueue.find((i) => i.localId === localId);
        if (!item) return;

        const { failureReason: _dropped, ...queueItem } = item;
        const revived: OfflineQueueItem = {
            ...(queueItem as OfflineQueueItem),
            retryCount: 0,
            lastFailedAt: null,
        };

        const newDL = deadLetterQueue.filter((i) => i.localId !== localId);
        const newQueue = [...offlineQueue, revived];
        set({ deadLetterQueue: newDL, offlineQueue: newQueue });
        await Promise.all([persistDeadLetterQueue(newDL), persistOfflineQueue(newQueue)]);
    },

    discardDeadLetterItem: async (localId) => {
        const { deadLetterQueue } = get();
        const newDL = deadLetterQueue.filter((i) => i.localId !== localId);
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