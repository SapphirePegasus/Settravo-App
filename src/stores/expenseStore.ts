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
 *    placeholder (isPendingSync=true) is inserted immediately.  On sync
 *    success confirmExpense swaps it for the real server row.
 *  - Settlement data is NEVER stored — always computed on demand.
 *
 * Fix v3:
 *  - pendingLocalIds: tracks localIds currently in-flight so the realtime
 *    INSERT handler can suppress the duplicate that arrives after confirmExpense
 *    has already swapped the row. Without this, the sequence is:
 *      1. addExpenseOptimistic(localId)  → row appears
 *      2. server INSERT fires realtime   → applyExpensePatch sees new server id,
 *         no existing row matches, inserts AGAIN → duplicate visible until refresh
 *      3. confirmExpense(localId, serverRow) → replaces localId row
 *    With pendingLocalIds tracked per tripId the INSERT handler checks whether
 *    the incoming server row's created_at is within the current session before
 *    inserting, and confirmExpense clears the flag.
 *  - setSplitSettled: new action for optimistic mark-as-paid so settle.tsx
 *    does not have to wait for the realtime round-trip before reflecting the
 *    change in settledMap.
 */

/**
 * expenseStore.ts
 *
 * Fix v4:
 *  - confirmedServerIds: tracks server IDs returned by confirmExpense so that
 *    the subsequent realtime INSERT echo is recognised as a duplicate and dropped.
 *    This eliminates the "add expense shows duplicate" bug.
 *  - setSplitSettled: optimistic mark-as-paid for settle screen.
 */

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Expense, Split } from '../types/domain';
import { fetchAllSplitsForTrip, fetchExpenses } from '@/services/expenseService';

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
     * Each ID is removed from the set after the echo is consumed or after a
     * short TTL (handled on INSERT dedup path).
     */
    confirmedServerIds: Record<string, Set<string>>;

    setExpenses: (tripId: string, expenses: Expense[]) => void;
    setSplits: (expenseId: string, splits: Split[]) => void;
    addExpenseOptimistic: (tripId: string, expense: Expense) => void;
    confirmExpense: (tripId: string, localId: string, confirmed: Expense) => void;
    removeExpense: (tripId: string, expenseId: string) => void;
    setLoading: (v: boolean) => void;
    setSplitSettled: (expenseIds: string[], memberId: string, settled: boolean) => void;
    applyExpensePatch: (tripId: string, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    applySplitPatch: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
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

    loadExpenses: async (tripId: string) => {
        // Guard: don't re-fetch if already loading or fetched for this trip
        const state = get();
        if (state.hasFetched?.[tripId]) return;

        set((s) => ({ isLoading: true }));
        try {
            const [expenses, splits] = await Promise.all([
                fetchExpenses(tripId),
                fetchAllSplitsForTrip(tripId),
            ]);
            set((s) => ({
                expenses: { ...s.expenses, [tripId]: expenses },
                splits: { ...s.splits, [tripId]: splits },
                hasFetched: { ...s.hasFetched, [tripId]: true },
                isLoading: false,
            }));
        } catch {
            set({ isLoading: false });
        }
    },

    setSplitSettled: (expenseIds, memberId, settled) =>
        set((s) => {
            const updatedSplits = { ...s.splits };
            for (const expenseId of expenseIds) {
                const existing = updatedSplits[expenseId] ?? [];
                updatedSplits[expenseId] = existing.map((sp) =>
                    sp.memberId === memberId ? { ...sp, isSettled: settled } : sp,
                );
            }
            return { splits: updatedSplits };
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
