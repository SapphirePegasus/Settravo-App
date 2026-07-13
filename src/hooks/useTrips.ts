/**
 * useTrips.ts
 *
 * Trip loading lifecycle — Phase-3 cache-first version.
 *
 * Order of operations on mount:
 *  1. Hydrate instantly from the SQLite cache (works offline, kills the
 *     blank-screen flash online too).
 *  2. Load the joined-IDs list + offline queue from AsyncStorage.
 *  3. If online, refresh from the network; on success the store writes the
 *     fresh list back through to the cache.
 *
 * Offline behaviour: cached trips are treated as the fetched state
 * (hasFetched=true) so screens render data + an offline banner instead of
 * skeletons that never resolve.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppError } from '../errors/AppError';
import { fetchMyTrips } from '../services/tripService';
import { useConnectionStore } from '../stores/connectionStore';
import { useTripStore } from '../stores/tripStore';

export function useTrips() {
    const loadJoinedIds = useTripStore((s) => s.loadJoinedIds);
    const loadOfflineQueue = useTripStore((s) => s.loadOfflineQueue);
    const loadDeadLetterQueue = useTripStore((s) => s.loadDeadLetterQueue);
    const hydrateTripsFromCache = useTripStore((s) => s.hydrateTripsFromCache);
    const setTrips = useTripStore((s) => s.setTrips);
    const setLoading = useTripStore((s) => s.setLoading);
    const setHasFetched = useTripStore((s) => s.setHasFetched);
    const trips = useTripStore((s) => s.trips);
    const isLoading = useTripStore((s) => s.isLoading);
    const hasFetched = useTripStore((s) => s.hasFetched);
    const networkOnline = useConnectionStore((s) => s.networkOnline);

    const [fetchError, setFetchError] = useState<AppError | null>(null);

    const fetchTrips = useCallback(async () => {
        if (!networkOnline) {
            // Offline: the cache is the data. Mark as fetched so the UI
            // renders it rather than waiting on a network that isn't coming.
            setLoading(false);
            setHasFetched(true);
            return;
        }
        setLoading(true);
        setFetchError(null);
        try {
            const fetched = await fetchMyTrips();
            setTrips(fetched); // write-through to cache happens in the store
            setHasFetched(true);
        } catch (err) {
            const appErr =
                err instanceof AppError
                    ? err
                    : new AppError('UNKNOWN', err instanceof Error ? err.message : 'Unknown error');
            setFetchError(appErr);
            // Do NOT clear trips on failure — stale data is better than empty list
        } finally {
            setLoading(false);
        }
    }, [setLoading, setTrips, setHasFetched, networkOnline]);

    useEffect(() => {
        // Cache hydration is synchronous — data is on screen before any await.
        hydrateTripsFromCache();
        Promise.all([loadJoinedIds(), loadOfflineQueue(), loadDeadLetterQueue()]).then(() =>
            fetchTrips(),
        );
    }, [hydrateTripsFromCache, loadJoinedIds, loadOfflineQueue, loadDeadLetterQueue, fetchTrips]);

    return { trips, isLoading, hasFetched, fetchError, refresh: fetchTrips };
}