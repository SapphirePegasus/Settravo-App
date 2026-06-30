/**
 * useExpenses.ts
 *
 * Hook that manages the full expense + realtime lifecycle for a trip.
 *
 *  1. Fetches all expenses and splits from Supabase on mount.
 *  2. Starts the Realtime subscription for the trip channel.
 *  3. Tears down the subscription on unmount (critical — prevents leaks).
 *  4. Exposes expenses, splits, loading state, and a refresh function.
 *
 * Usage: call at the top of any trip-scoped screen. It is safe for multiple
 * sibling screens (index, activity, settle) to call this concurrently for
 * the same tripId — realtimeService.ts reference-counts a single shared
 * channel per tripId, so duplicate calls reuse it instead of conflicting.
 * 
 * FIX (v2): The previous implementation used inline `?? []` in the Zustand
 * selector, which creates a new array reference on every render when the key
 * is absent. React 18's concurrent mode calls getSnapshot multiple times and
 * detects the unstable reference, throwing:
 *   "The result of getSnapshot should be cached to avoid an infinite loop"
 * Solution: use a module-level stable empty constant as the fallback, so the
 * selector always returns the same reference when no expenses exist yet.
 */

import { useCallback, useEffect, useRef } from 'react';
import { fetchAllSplitsForTrip, fetchExpenses } from '../services/expenseService';
import { subscribeToTrip, type RealtimeSubscription } from '../services/realtimeService';
import { useExpenseStore } from '../stores/expenseStore';
import type { Expense, Split } from '../types/domain';

// ── Stable empty references ───────────────────────────────────────────────────
// Module-level constants are allocated once. Returning them from a Zustand
// selector always yields the same reference, satisfying React's getSnapshot
// contract and preventing the infinite-loop crash.
const EMPTY_EXPENSES: Expense[] = [];

export function useExpenses(tripId: string) {
    const setExpenses = useExpenseStore((s) => s.setExpenses);
    const setSplits = useExpenseStore((s) => s.setSplits);
    const setLoading = useExpenseStore((s) => s.setLoading);

    // Stable selector: never creates a new [] inline.
    const expenses = useExpenseStore(
        (s) => s.expenses[tripId] ?? EMPTY_EXPENSES,
    );
    const isLoading = useExpenseStore((s) => s.isLoading);

    // In useExpenses, change the subscription ref type and expose reconnect:
    const subscriptionRef = useRef<RealtimeSubscription | null>(null);

    const loadData = useCallback(async () => {
        if (!tripId) return;
        setLoading(true);
        try {
            const [fetchedExpenses, fetchedSplits] = await Promise.all([
                fetchExpenses(tripId),
                fetchAllSplitsForTrip(tripId),
            ]);

            setExpenses(tripId, fetchedExpenses);

            // Index splits by expenseId
            const splitsByExpense: Record<string, Split[]> = {};
            for (const split of fetchedSplits) {
                if (!splitsByExpense[split.expenseId]) splitsByExpense[split.expenseId] = [];
                splitsByExpense[split.expenseId].push(split);
            }
            for (const [expenseId, splits] of Object.entries(splitsByExpense)) {
                setSplits(expenseId, splits);
            }
        } catch (err) {
            console.error('[useExpenses] fetch failed:', err);
        } finally {
            setLoading(false);
        }
    }, [tripId, setExpenses, setSplits, setLoading]);

    useEffect(() => {
        if (!tripId) return;

        // Initial data load
        loadData();

        // Start Realtime — one subscription per trip, cleaned up on unmount
        subscriptionRef.current = subscribeToTrip(tripId);

        return () => {
            subscriptionRef.current?.unsubscribe();
            subscriptionRef.current = null;
        };
    }, [tripId, loadData]);

    return {
        expenses,
        isLoading,
        refresh: loadData,
        reconnectRealtime: () => subscriptionRef.current?.reconnect(),
    };
}