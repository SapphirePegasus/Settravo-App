/**
 * expenseStore.ts
 *
 * Zustand store for expenses and splits within the active trip.
 *
 * Design decisions:
 *  - Expenses and splits are keyed by tripId / expenseId respectively,
 *    so switching trips is instant and data is never mixed.
 *  - Realtime patches are applied here via applyExpensePatch /
 *    applySplitPatch — screens never touch realtime payloads directly.
 *  - Optimistic updates: when a user adds an expense offline a local
 *    placeholder (isPendingSync=true) is inserted immediately. On sync
 *    success confirmExpense swaps it for the real server row.
 *  - Settlement data is NEVER stored — always computed on demand.
 *
 * v4 (kept):
 *  - confirmedServerIds: tracks server IDs returned by confirmExpense so the
 *    subsequent realtime INSERT echo is recognised as a duplicate and dropped.
 *
 * Phase-2 change:
 *  - setSplitSettled (guess-based optimistic flip over a screen-computed
 *    expense-id list) is REMOVED. It was the source of local/server drift:
 *    the screen flipped one set of rows, the RPC flipped another.
 *  - applyServerSplits replaces it: upserts the EXACT rows returned by
 *    settravo_settle_pair. What the server changed is what the store shows —
 *    nothing more, nothing less. Realtime echoes of the same rows are
 *    idempotent (upsert by id).
 */

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Expense, Split } from '../types/domain';
import { fetchAllSplitsForTrip, fetchExpenses } from '../services/expenseService';

interface ExpenseState {
    expenses: Record<string, Expense[]>;
    splits: Record<string, Split[]>;
    isLoading: boolean;
    pendingLocalIds: Record<string, Set<string>>;
    hasFetched: Record<string, boolean>;
    /**
     * confirmedServerIds[tripId] → Set of server-assigned expense IDs that have
     * been confirmed via confirmExpense(). The realtime INSERT for these IDs
     * arrives shortly after and must be dropped to prevent duplicates.
     */
    confirmedServerIds: Record<string, Set<string>>;

    setExpenses: (tripId: string, expenses: Expense[]) => void;
    setSplits: (expenseId: string, splits: Split[]) => void;
    addExpenseOptimistic: (tripId: string, expense: Expense) => void;
    confirmExpense: (tripId: string, localId: string, confirmed: Expense) => void;
    removeExpense: (tripId: string, expenseId: string) => void;
    setLoading: (v: boolean) => void;
    setHasFetched: (tripId: string, v: boolean) => void;
    /**
     * Batch-load expenses + splits for a trip once (used by the cross-trip
     * activity feed). No-op if this trip was already fetched this session.
     */
    loadExpenses: (tripId: string) => Promise<void>;
    /**
     * Upsert split rows exactly as returned by the server (settle RPC or a
     * fetch). Rows are matched by id within their expense bucket. This is
     * the ONLY sanctioned way to reflect settle-state changes locally.
     */
    applyServerSplits: (updated: Split[]) => void;
    applyExpensePatch: (
        tripId: string,
        payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => void;
    applySplitPatch: (
        payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => void;
}

function rowToExpense(row: Record<string, unknown>): Expense {
    return {
        id: row.id as string,
        tripId: row.trip_id as string,
        paidByMember: row.paid_by_member as string,
        title: row.title as string,
        category: (row.category as Expense['category']) ?? null,
        amountMoney: row.amount_money as number,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isPendingSync: false,
    };
}

function rowToSplit(row: Record<string, unknown>): Split {
    return {
        id: row.id as string,
        expenseId: row.expense_id as string,
        memberId: row.member_id as string,
        shareMoney: row.share_money as number,
        isSettled: row.is_settled as boolean,
    };
}

const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_SPLITS: Split[] = [];

export const useExpenseStore = create<ExpenseState>((set, get) => ({
    expenses: {},
    splits: {},
    isLoading: false,
    pendingLocalIds: {},
    hasFetched: {},
    confirmedServerIds: {},

    setExpenses: (tripId, expenses) =>
        set((s) => ({ expenses: { ...s.expenses, [tripId]: expenses } })),

    setSplits: (expenseId, splits) =>
        set((s) => ({ splits: { ...s.splits, [expenseId]: splits } })),

    addExpenseOptimistic: (tripId, expense) =>
        set((s) => {
            const existing = s.expenses[tripId] ?? [];
            // Guard: never insert a duplicate local entry
            if (existing.some((e) => e.id === expense.id)) return s;
            const pending = new Set(s.pendingLocalIds[tripId] ?? []);
            pending.add(expense.id);
            return {
                expenses: { ...s.expenses, [tripId]: [expense, ...existing] },
                pendingLocalIds: { ...s.pendingLocalIds, [tripId]: pending },
            };
        }),

    confirmExpense: (tripId, localId, confirmed) =>
        set((s) => {
            const existing = s.expenses[tripId] ?? [];

            // Register the server ID so the realtime INSERT echo is dropped
            const confirmedSet = new Set(s.confirmedServerIds[tripId] ?? []);
            confirmedSet.add(confirmed.id);

            const updated = existing.map((e) =>
                e.id === localId ? { ...confirmed, isPendingSync: false } : e,
            );

            const pending = new Set(s.pendingLocalIds[tripId] ?? []);
            pending.delete(localId);

            return {
                expenses: { ...s.expenses, [tripId]: updated },
                pendingLocalIds: { ...s.pendingLocalIds, [tripId]: pending },
                confirmedServerIds: { ...s.confirmedServerIds, [tripId]: confirmedSet },
            };
        }),

    removeExpense: (tripId, expenseId) =>
        set((s) => ({
            expenses: {
                ...s.expenses,
                [tripId]: (s.expenses[tripId] ?? []).filter((e) => e.id !== expenseId),
            },
            splits: { ...s.splits, [expenseId]: [] },
        })),

    setLoading: (v) => set({ isLoading: v }),

    setHasFetched: (tripId, v) =>
        set((s) => ({ hasFetched: { ...s.hasFetched, [tripId]: v } })),

    loadExpenses: async (tripId) => {
        // Guard: don't re-fetch if already fetched for this trip this session
        if (get().hasFetched[tripId]) return;

        set({ isLoading: true });
        try {
            const [expenses, splits] = await Promise.all([
                fetchExpenses(tripId),
                fetchAllSplitsForTrip(tripId),
            ]);

            // Index splits by expenseId so buckets replace atomically
            const byExpense: Record<string, Split[]> = {};
            for (const split of splits) {
                (byExpense[split.expenseId] ??= []).push(split);
            }

            set((s) => ({
                expenses: { ...s.expenses, [tripId]: expenses },
                splits: { ...s.splits, ...byExpense },
                hasFetched: { ...s.hasFetched, [tripId]: true },
                isLoading: false,
            }));
        } catch {
            set({ isLoading: false });
        }
    },

    applyServerSplits: (updated) =>
        set((s) => {
            if (updated.length === 0) return s;

            const nextSplits = { ...s.splits };
            for (const split of updated) {
                const bucket = nextSplits[split.expenseId] ?? [];
                const without = bucket.filter((sp) => sp.id !== split.id);
                nextSplits[split.expenseId] = [...without, split];
            }
            return { splits: nextSplits };
        }),

    applyExpensePatch: (tripId, payload) =>
        set((s) => {
            const eventType = payload.eventType;

            if (eventType === 'INSERT' && payload.new) {
                const newExpense = rowToExpense(payload.new as Record<string, unknown>);

                // Drop realtime echo of an expense we already confirmed locally
                const confirmedSet = s.confirmedServerIds[tripId] ?? new Set<string>();
                if (confirmedSet.has(newExpense.id)) {
                    const updatedConfirmed = new Set(confirmedSet);
                    updatedConfirmed.delete(newExpense.id);
                    return {
                        confirmedServerIds: {
                            ...s.confirmedServerIds,
                            [tripId]: updatedConfirmed,
                        },
                    };
                }

                const existing = s.expenses[tripId] ?? [];
                // Also guard against any other duplicate by server ID
                if (existing.some((e) => e.id === newExpense.id)) return s;

                return {
                    expenses: {
                        ...s.expenses,
                        [tripId]: [newExpense, ...existing],
                    },
                };
            }

            if (eventType === 'UPDATE' && payload.new) {
                const updated = rowToExpense(payload.new as Record<string, unknown>);
                return {
                    expenses: {
                        ...s.expenses,
                        [tripId]: (s.expenses[tripId] ?? []).map((e) =>
                            e.id === updated.id ? updated : e,
                        ),
                    },
                };
            }

            if (eventType === 'DELETE' && payload.old) {
                const deletedId = (payload.old as Record<string, unknown>).id as string;
                return {
                    expenses: {
                        ...s.expenses,
                        [tripId]: (s.expenses[tripId] ?? []).filter((e) => e.id !== deletedId),
                    },
                };
            }

            return s;
        }),

    applySplitPatch: (payload) =>
        set((s) => {
            const eventType = payload.eventType;

            if ((eventType === 'INSERT' || eventType === 'UPDATE') && payload.new) {
                const split = rowToSplit(payload.new as Record<string, unknown>);
                const existing = s.splits[split.expenseId] ?? [];
                const without = existing.filter((sp) => sp.id !== split.id);
                return {
                    splits: {
                        ...s.splits,
                        [split.expenseId]: [...without, split],
                    },
                };
            }

            if (eventType === 'DELETE' && payload.old) {
                const old = payload.old as Record<string, unknown>;
                const expenseId = old.expense_id as string;
                const id = old.id as string;
                return {
                    splits: {
                        ...s.splits,
                        [expenseId]: (s.splits[expenseId] ?? []).filter((sp) => sp.id !== id),
                    },
                };
            }

            return s;
        }),
}));

// Stable empty refs for hooks
export { EMPTY_EXPENSES, EMPTY_SPLITS };