/**
 * useStatisticsData.ts
 *
 * The data layer the Statistics tab never had.
 *
 * Root problem being fixed: the old screen read whatever happened to be in
 * expenseStore / memberStore — i.e. only trips the user had opened this
 * session. On a fresh launch Statistics was empty or silently partial, and
 * every number depending on "me" was ZERO because it compared split
 * member-IDs against the auth uid (different ID spaces).
 *
 * This hook guarantees, for EVERY joined trip:
 *  1. Instant hydration from the SQLite cache (works offline).
 *  2. A network refresh (expenses + splits + members) with write-through,
 *     at most once per trip per session (force=true on pull-to-refresh).
 *  3. A correct identity map: tripId → MY member-id in that trip
 *     (matched via member.deviceId === deviceUser.id).
 *
 * Balance-parity refactor: cache hydration lives in lib/tripHydration and
 * the identity map in utils/balances so the Dashboard (useMyBalances) uses
 * the exact same code paths. This hook keeps what is unique to Statistics:
 * the network refresh policy.
 *
 * Mount once in the Statistics screen. Reuses useTrips (idempotent) so the
 * trip list itself is also loaded/cached without duplicating that logic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cacheMembers, cacheTripData } from '../lib/localCache';
import { hydrateTripFromCache, indexSplitsByExpense } from '../lib/tripHydration';
import { fetchAllSplitsForTrip, fetchExpenses } from '../services/expenseService';
import { fetchMembers } from '../services/memberService';
import { useConnectionStore } from '../stores/connectionStore';
import { useExpenseStore } from '../stores/expenseStore';
import { useMemberStore } from '../stores/memberStore';
import { useAuthStore } from '../stores/authStore';
import { buildMyMemberIdMap } from '../utils/balances';
import { useTrips } from './useTrips';

export function useStatisticsData() {
    const { trips } = useTrips();
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const membersByTrip = useMemberStore((s) => s.members);
    const setMembers = useMemberStore((s) => s.setMembers);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    // Trips already network-refreshed by this hook this session.
    const refreshedTrips = useRef<Set<string>>(new Set());

    /** Network refresh of one trip with write-through. Never throws. */
    const refreshTrip = useCallback(
        async (tripId: string): Promise<void> => {
            try {
                const [expenses, splits, members] = await Promise.all([
                    fetchExpenses(tripId),
                    fetchAllSplitsForTrip(tripId),
                    fetchMembers(tripId),
                ]);
                const expenseState = useExpenseStore.getState();
                expenseState.setExpenses(tripId, expenses);
                for (const [expenseId, list] of Object.entries(indexSplitsByExpense(splits))) {
                    expenseState.setSplits(expenseId, list);
                }
                setMembers(tripId, members);
                cacheTripData(tripId, expenses, splits);
                cacheMembers(tripId, members);
            } catch (err) {
                // Offline or transient — cached/hydrated data stays on screen.
                console.warn(`[useStatisticsData] refresh failed for ${tripId} (cache remains):`, err);
            }
        },
        [setMembers],
    );

    const loadAll = useCallback(
        async (force: boolean) => {
            // 1. Synchronous cache hydration for every trip — data on screen
            //    before any network round-trip, and the entire offline story.
            for (const trip of trips) hydrateTripFromCache(trip.id);

            // 2. Online refresh, once per trip per session unless forced.
            if (!useConnectionStore.getState().networkOnline) return;
            const due = trips.filter(
                (t) => force || !refreshedTrips.current.has(t.id),
            );
            if (due.length === 0) return;

            await Promise.all(due.map((t) => refreshTrip(t.id)));
            for (const t of due) refreshedTrips.current.add(t.id);
        },
        [trips, refreshTrip],
    );

    // Initial load: runs when the trip list becomes available/changes.
    useEffect(() => {
        let mounted = true;
        loadAll(false).finally(() => {
            if (mounted) setInitialLoadDone(true);
        });
        return () => {
            mounted = false;
        };
    }, [loadAll]);

    const refresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await loadAll(true);
        } finally {
            setIsRefreshing(false);
        }
    }, [loadAll]);

    /**
     * tripId → my member-id in that trip. THE identity fix: splits and
     * expenses reference member IDs, never the auth uid. Shared with the
     * Dashboard via utils/balances so both screens resolve identity
     * identically.
     */
    const myMemberIdByTrip = useMemo(
        () => buildMyMemberIdMap(trips, membersByTrip, deviceUser?.id),
        [trips, membersByTrip, deviceUser?.id],
    );

    return {
        trips,
        myMemberIdByTrip,
        isLoading: !initialLoadDone,
        isRefreshing,
        refresh,
    };
}