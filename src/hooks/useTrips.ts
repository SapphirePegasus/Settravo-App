/**
 * useTrips.ts
 *
 * Hook that manages the full trip loading lifecycle.
 * Phase 4 addition: exposes `fetchError` so the Home screen can surface
 * a toast when an online fetch fails instead of swallowing it silently.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppError } from '../errors/AppError';
import { fetchMyTrips } from '../services/tripService';
import { useConnectionStore } from '../stores/connectionStore';
import { useTripStore } from '../stores/tripStore';

export function useTrips() {
    const loadJoinedIds = useTripStore((s) => s.loadJoinedIds);
    const loadOfflineQueue = useTripStore((s) => s.loadOfflineQueue);
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
            setLoading(false);
            return;
        }
        setLoading(true);
        setFetchError(null);
        try {
            const fetched = await fetchMyTrips();
            setTrips(fetched);
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
        Promise.all([loadJoinedIds(), loadOfflineQueue()]).then(() => fetchTrips());
    }, [loadJoinedIds, loadOfflineQueue, fetchTrips]);

    return { trips, isLoading, hasFetched, fetchError, refresh: fetchTrips };
}