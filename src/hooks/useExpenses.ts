/**
 * useExpenses.ts
 *
 * Full expense + realtime lifecycle for a trip — Phase-3 cache-first version.
 *
 *  1. Hydrate expenses + splits instantly from the SQLite cache.
 *  2. Fetch fresh from Supabase; on success write the snapshot back through.
 *  3. Start the Realtime subscription (reference-counted per trip).
 *  4. On fetch failure (offline), the cached snapshot remains on screen.
 *
 * getSnapshot stability (kept from v2): module-level EMPTY_EXPENSES constant
 * so the Zustand selector returns a stable reference — React 18 requirement.
 */

import { useCallback, useEffect, useRef } from 'react';
import { cacheTripData, readCachedExpenses, readCachedSplits } from '../lib/localCache';
import { fetchAllSplitsForTrip, fetchExpenses } from '../services/expenseService';
import { materializeRecurring } from '../services/templateService';
import { subscribeToTrip, type RealtimeSubscription } from '../services/realtimeService';
import { useConnectionStore } from '../stores/connectionStore';
import { useExpenseStore } from '../stores/expenseStore';
import type { Expense, Split } from '../types/domain';

const EMPTY_EXPENSES: Expense[] = [];

function indexSplitsByExpense(splits: Split[]): Record<string, Split[]> {
    const byExpense: Record<string, Split[]> = {};
    for (const split of splits) {
        (byExpense[split.expenseId] ??= []).push(split);
    }
    return byExpense;
}

export function useExpenses(tripId: string) {
    const setExpenses = useExpenseStore((s) => s.setExpenses);
    const setSplits = useExpenseStore((s) => s.setSplits);
    const setLoading = useExpenseStore((s) => s.setLoading);

    const expenses = useExpenseStore(
        (s) => s.expenses[tripId] ?? EMPTY_EXPENSES,
    );
    const isLoading = useExpenseStore((s) => s.isLoading);

    const subscriptionRef = useRef<RealtimeSubscription | null>(null);
    const hydratedForTripId = useRef<string | null>(null);

    const loadData = useCallback(async () => {
        if (!tripId) return;

        // Offline: don't spin a loader for a request that cannot succeed.
        // The cache hydration below (or a previous fetch) is the data.
        if (!useConnectionStore.getState().networkOnline) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // Phase 5: materialize any due recurring bills FIRST, so the
            // fetch below already includes them. Idempotent server-side —
            // safe on every open and every pull-to-refresh. A failure here
            // must never block loading real data.
            try {
                await materializeRecurring(tripId);
            } catch (err) {
                console.warn('[useExpenses] recurring materialization failed (non-fatal):', err);
            }

            const [fetchedExpenses, fetchedSplits] = await Promise.all([
                fetchExpenses(tripId),
                fetchAllSplitsForTrip(tripId),
            ]);

            setExpenses(tripId, fetchedExpenses);
            for (const [expenseId, splits] of Object.entries(indexSplitsByExpense(fetchedSplits))) {
                setSplits(expenseId, splits);
            }

            // Write-through: this trip is now fully readable offline.
            cacheTripData(tripId, fetchedExpenses, fetchedSplits);
        } catch (err) {
            console.warn('[useExpenses] fetch failed (cache remains):', err);
        } finally {
            setLoading(false);
        }
    }, [tripId, setExpenses, setSplits, setLoading]);

    useEffect(() => {
        if (!tripId) return;

        // 1. Instant, synchronous cache hydration — once per tripId per mount,
        //    and only when the store has nothing for this trip yet.
        if (hydratedForTripId.current !== tripId) {
            hydratedForTripId.current = tripId;
            const inStore = useExpenseStore.getState().expenses[tripId];
            if (!inStore || inStore.length === 0) {
                const cachedExpenses = readCachedExpenses(tripId);
                if (cachedExpenses.length > 0) {
                    setExpenses(tripId, cachedExpenses);
                    const cachedSplits = readCachedSplits(tripId);
                    for (const [expenseId, splits] of Object.entries(indexSplitsByExpense(cachedSplits))) {
                        setSplits(expenseId, splits);
                    }
                }
            }
        }

        // 2. Network refresh
        loadData();

        // 3. Realtime — one subscription per trip, cleaned up on unmount
        subscriptionRef.current = subscribeToTrip(tripId);

        return () => {
            subscriptionRef.current?.unsubscribe();
            subscriptionRef.current = null;
        };
    }, [tripId, loadData, setExpenses, setSplits]);

    return {
        expenses,
        isLoading,
        refresh: loadData,
        reconnectRealtime: () => subscriptionRef.current?.reconnect(),
    };
}