/**
 * useTrips.ts
 *
 * Hook that manages the full trip loading lifecycle:
 *  1. On mount: load joined trip IDs from AsyncStorage (instant, no network)
 *  2. Fetch full trip objects from Supabase for those IDs
 *  3. Update tripStore with the results
 *  4. Expose loading state and a refresh function
 *
 * This hook is used by the Home screen only. Trip detail screens use
 * selectActiveTrip() from the store directly (data is already fetched).
 */
import { useCallback, useEffect } from 'react';
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

    const fetchTrips = useCallback(async () => {
        if (!networkOnline) {
            // Serve from store (already loaded from AsyncStorage)
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const fetched = await fetchMyTrips();
            setTrips(fetched);
            setHasFetched(true);
        } catch (err) {
            console.error('[useTrips] fetch failed:', err);
            // Don't clear existing trips on failure — stale data > empty list
        } finally {
            setLoading(false);
        }
    }, [setLoading, setTrips, setHasFetched, networkOnline]);

    useEffect(() => {
        Promise.all([loadJoinedIds(), loadOfflineQueue()]).then(() => {
            fetchTrips();
        });
    }, [loadJoinedIds, loadOfflineQueue, fetchTrips]);

    return { trips, isLoading, hasFetched, refresh: fetchTrips };
}