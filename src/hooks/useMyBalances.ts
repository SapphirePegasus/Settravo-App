/**
 * useMyBalances.ts
 *
 * Cross-trip balances for the Dashboard stat cards.
 *
 * Deliberately LIGHTWEIGHT — the offline-first counterpart to
 * useStatisticsData:
 *  - Hydrates every joined trip from the SQLite cache (synchronous,
 *    idempotent, works offline). Without this, the Dashboard computed over
 *    only the trips the user happened to open this session.
 *  - Does NOT trigger network refreshes. The Dashboard is the launch screen;
 *    fanning out 3 requests per trip at boot would front-load network cost.
 *    Fresh data arrives through the existing channels (trip screens,
 *    Statistics, realtime patches) — this hook subscribes to the stores, so
 *    the cards update live when any of those write.
 *  - All math is delegated to computeMyBalances, the same engine as the
 *    Statistics balance card and the Settle screen. One engine, one truth.
 */

import { useEffect, useMemo } from 'react';
import { hydrateTripFromCache } from '../lib/tripHydration';
import { useAuthStore } from '../stores/authStore';
import { useExpenseStore } from '../stores/expenseStore';
import { useMemberStore } from '../stores/memberStore';
import { buildMyMemberIdMap, computeMyBalances, type MyBalances } from '../utils/balances';
import { useTrips } from './useTrips';

export function useMyBalances(): MyBalances {
    const { trips } = useTrips();
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const expensesByTrip = useExpenseStore((s) => s.expenses);
    const splitsByExpense = useExpenseStore((s) => s.splits);
    const membersByTrip = useMemberStore((s) => s.members);

    // Cache-only hydration whenever the joined-trip list changes.
    // hydrateTripFromCache only writes into EMPTY store buckets, so this
    // cannot loop and never clobbers fresher in-memory data.
    useEffect(() => {
        for (const trip of trips) hydrateTripFromCache(trip.id);
    }, [trips]);

    const myMemberIdByTrip = useMemo(
        () => buildMyMemberIdMap(trips, membersByTrip, deviceUser?.id),
        [trips, membersByTrip, deviceUser?.id],
    );

    return useMemo(
        () =>
            computeMyBalances(
                trips,
                myMemberIdByTrip,
                expensesByTrip,
                splitsByExpense,
                membersByTrip,
            ),
        [trips, myMemberIdByTrip, expensesByTrip, splitsByExpense, membersByTrip],
    );
}