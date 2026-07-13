/**
 * tripHydration.ts
 *
 * Shared, store-level cache hydration — extracted from useStatisticsData so
 * that every screen needing cross-trip data (Dashboard, Statistics) uses the
 * SAME hydration path instead of re-implementing it.
 *
 * Rules:
 *  - Synchronous (expo-sqlite sync API via localCache) — data is in the
 *    stores before any network round-trip. This is the entire offline story.
 *  - Idempotent: only fills a store bucket that is currently empty, so it is
 *    safe to call from multiple mounted screens and inside effects without
 *    causing update loops.
 *  - No network. Network refresh policy stays with the caller
 *    (useStatisticsData refreshes; useMyBalances deliberately does not).
 */

import {
    readCachedExpenses,
    readCachedMembers,
    readCachedSplits,
} from './localCache';
import { useExpenseStore } from '../stores/expenseStore';
import { useMemberStore } from '../stores/memberStore';
import type { Split } from '../types/domain';

/** Group a flat split list by expenseId — the shape expenseStore expects. */
export function indexSplitsByExpense(splits: Split[]): Record<string, Split[]> {
    const byExpense: Record<string, Split[]> = {};
    for (const split of splits) {
        (byExpense[split.expenseId] ??= []).push(split);
    }
    return byExpense;
}

/**
 * Hydrate one trip's expenses, splits, and members from the SQLite cache
 * into the Zustand stores. Synchronous, offline-safe, idempotent.
 */
export function hydrateTripFromCache(tripId: string): void {
    const expenseState = useExpenseStore.getState();
    if (!expenseState.expenses[tripId] || expenseState.expenses[tripId].length === 0) {
        const cachedExpenses = readCachedExpenses(tripId);
        if (cachedExpenses.length > 0) {
            expenseState.setExpenses(tripId, cachedExpenses);
            const cachedSplits = readCachedSplits(tripId);
            for (const [expenseId, splits] of Object.entries(indexSplitsByExpense(cachedSplits))) {
                expenseState.setSplits(expenseId, splits);
            }
        }
    }

    const memberState = useMemberStore.getState();
    if (!memberState.members[tripId] || memberState.members[tripId].length === 0) {
        const cachedMembers = readCachedMembers(tripId);
        if (cachedMembers.length > 0) {
            memberState.setMembers(tripId, cachedMembers);
        }
    }
}