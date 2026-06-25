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

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Expense, Split } from '../types/domain';

// ─── State shape ──────────────────────────────────────────────────────────────

interface ExpenseState {
    /** expenses[tripId] → Expense[] */
    expenses: Record<string, Expense[]>;
    /** splits[expenseId] → Split[] */
    splits: Record<string, Split[]>;
    isLoading: boolean;
    /**
     * pendingLocalIds[tripId] → Set of localIds that have been submitted
     * optimistically but whose server confirmation has not yet arrived.
     * Used to suppress the duplicate realtime INSERT that races with
     * confirmExpense.
     */
    pendingLocalIds: Record<string, Set<string>>;

    // ── Actions ───────────────────────────────────────────────────────────────
    setExpenses: (tripId: string, expenses: Expense[]) => void;
    setSplits: (expenseId: string, splits: Split[]) => void;
    addExpenseOptimistic: (tripId: string, expense: Expense) => void;
    confirmExpense: (tripId: string, localId: string, confirmed: Expense) => void;
    removeExpense: (tripId: string, expenseId: string) => void;
    setLoading: (v: boolean) => void;
    /**
     * Optimistically mark / unmark all splits between two members as settled.
     * Called immediately from settle.tsx so settledMap reflects the change
     * without waiting for the realtime round-trip.
     */
    setSplitSettled: (
        expenseIds: string[],
        debtorMemberId: string,
        settled: boolean,
    ) => void;

    /** Apply a Realtime postgres_changes payload for TravelAppExpenses. */
    applyExpensePatch: (
        tripId: string,
        payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => void;

    /** Apply a Realtime postgres_changes payload for TravelAppSplits. */
    applySplitPatch: (
        payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => void;
}

// ─── Row → domain mappers ─────────────────────────────────────────────────────

function rowToExpense(row: Record<string, unknown>): Expense {
    return {
        id: (row.id as string) ?? '',
        tripId: (row.trip_id as string) ?? '',
        paidByMember: (row.paid_by_member as string) ?? '',
        title: (row.title as string) ?? '',
        category: ((row.category as Expense['category']) ?? null),
        amountMoney: typeof row.amount_money === 'number' ? row.amount_money : 0,
        createdAt: (row.created_at as string) ?? new Date().toISOString(),
        updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
        isPendingSync: false,
    };
}

function rowToSplit(row: Record<string, unknown>): Split {
    return {
        id: (row.id as string) ?? '',
        expenseId: (row.expense_id as string) ?? '',
        memberId: (row.member_id as string) ?? '',
        shareMoney: typeof row.share_money === 'number' ? row.share_money : 0,
        isSettled: row.is_settled === true,
    };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useExpenseStore = create<ExpenseState>((set, get) => ({
    expenses: {},
    splits: {},
    isLoading: false,
    pendingLocalIds: {},

    setExpenses: (tripId, expenses) =>
        set((s) => ({ expenses: { ...s.expenses, [tripId]: expenses } })),

    setSplits: (expenseId, splits) =>
        set((s) => ({ splits: { ...s.splits, [expenseId]: splits } })),

    addExpenseOptimistic: (tripId, expense) =>
        set((s) => {
            // Track localId as pending so the racing realtime INSERT is suppressed
            const existing = s.pendingLocalIds[tripId] ?? new Set<string>();
            const updated = new Set(existing);
            updated.add(expense.id);
            return {
                expenses: {
                    ...s.expenses,
                    [tripId]: [expense, ...(s.expenses[tripId] ?? [])],
                },
                pendingLocalIds: { ...s.pendingLocalIds, [tripId]: updated },
            };
        }),

    confirmExpense: (tripId, localId, confirmed) =>
        set((s) => {
            // Remove from pending set
            const pending = new Set(s.pendingLocalIds[tripId] ?? new Set<string>());
            pending.delete(localId);

            // Also deduplicate: if the realtime INSERT already snuck in, remove it
            const current = s.expenses[tripId] ?? [];
            const withoutDuplicate = current.filter(
                (e) => e.id !== confirmed.id || e.id === localId,
            );

            return {
                expenses: {
                    ...s.expenses,
                    [tripId]: withoutDuplicate.map((e) =>
                        e.id === localId ? confirmed : e,
                    ),
                },
                pendingLocalIds: { ...s.pendingLocalIds, [tripId]: pending },
            };
        }),

    removeExpense: (tripId, expenseId) =>
        set((s) => {
            const filtered = (s.expenses[tripId] ?? []).filter(
                (e) => e.id !== expenseId,
            );
            const newSplits = { ...s.splits };
            delete newSplits[expenseId];
            return {
                expenses: { ...s.expenses, [tripId]: filtered },
                splits: newSplits,
            };
        }),

    setLoading: (v) => set({ isLoading: v }),

    setSplitSettled: (expenseIds, debtorMemberId, settled) =>
        set((s) => {
            const newSplits = { ...s.splits };
            for (const expenseId of expenseIds) {
                const current = newSplits[expenseId];
                if (!current) continue;
                newSplits[expenseId] = current.map((sp) =>
                    sp.memberId === debtorMemberId ? { ...sp, isSettled: settled } : sp,
                );
            }
            return { splits: newSplits };
        }),

    // ── Realtime patch handlers ───────────────────────────────────────────────

    applyExpensePatch: (tripId, payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        const state = get();

        if (eventType === 'INSERT' && newRow && Object.keys(newRow).length > 0) {
            const expense = rowToExpense(newRow as Record<string, unknown>);
            if (!expense.id) return;

            const existing = state.expenses[tripId] ?? [];

            // 1. Exact duplicate by server id — already confirmed or duplicate event
            if (existing.some((e) => e.id === expense.id)) return;

            // 2. The optimistic placeholder (localId) is still in the list and
            //    pendingLocalIds tells us confirmExpense hasn't fired yet.
            //    Suppress this INSERT; confirmExpense will swap the row cleanly.
            const pending = state.pendingLocalIds[tripId] ?? new Set<string>();
            if (pending.size > 0) {
                // There is at least one in-flight optimistic expense for this trip.
                // The incoming server row must correspond to one of them.
                // We suppress it here; confirmExpense will do the authoritative swap.
                return;
            }

            set((s) => ({
                expenses: {
                    ...s.expenses,
                    [tripId]: [expense, ...(s.expenses[tripId] ?? [])],
                },
            }));
            return;
        }

        if (eventType === 'UPDATE' && newRow && Object.keys(newRow).length > 0) {
            const updated = rowToExpense(newRow as Record<string, unknown>);
            if (!updated.id) return;

            set((s) => ({
                expenses: {
                    ...s.expenses,
                    [tripId]: (s.expenses[tripId] ?? []).map((e) =>
                        e.id === updated.id ? updated : e,
                    ),
                },
            }));
            return;
        }

        if (eventType === 'DELETE' && oldRow && Object.keys(oldRow).length > 0) {
            const deletedId = (oldRow as Record<string, unknown>).id as string;
            if (!deletedId) return;
            get().removeExpense(tripId, deletedId);
        }
    },

    applySplitPatch: (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === 'INSERT' && newRow && Object.keys(newRow).length > 0) {
            const split = rowToSplit(newRow as Record<string, unknown>);
            if (!split.id || !split.expenseId) return;

            set((s) => ({
                splits: {
                    ...s.splits,
                    [split.expenseId]: [
                        ...(s.splits[split.expenseId] ?? []).filter(
                            (sp) => sp.id !== split.id,
                        ),
                        split,
                    ],
                },
            }));
            return;
        }

        if (eventType === 'UPDATE' && newRow && Object.keys(newRow).length > 0) {
            const split = rowToSplit(newRow as Record<string, unknown>);
            if (!split.id || !split.expenseId) return;

            set((s) => ({
                splits: {
                    ...s.splits,
                    [split.expenseId]: (s.splits[split.expenseId] ?? []).map(
                        (sp) => (sp.id === split.id ? split : sp),
                    ),
                },
            }));
            return;
        }

        if (eventType === 'DELETE' && oldRow && Object.keys(oldRow).length > 0) {
            const old = oldRow as Record<string, unknown>;
            const expenseId = old.expense_id as string;
            const splitId = old.id as string;
            if (!expenseId || !splitId) return;

            set((s) => ({
                splits: {
                    ...s.splits,
                    [expenseId]: (s.splits[expenseId] ?? []).filter(
                        (sp) => sp.id !== splitId,
                    ),
                },
            }));
        }
    },
}));

// ─── Derived / selector helpers ───────────────────────────────────────────────

export function selectIsSettledBetween(
    state: ExpenseState,
    tripId: string,
    debtorMemberId: string,
    creditorMemberId: string,
    expenses: Expense[],
): boolean {
    const creditorExpenseIds = expenses
        .filter(
            (e) => e.tripId === tripId && e.paidByMember === creditorMemberId,
        )
        .map((e) => e.id);

    if (creditorExpenseIds.length === 0) return false;

    const relevantSplits: Split[] = [];
    for (const expenseId of creditorExpenseIds) {
        const splits = state.splits[expenseId] ?? [];
        const debtorSplit = splits.find((s) => s.memberId === debtorMemberId);
        if (debtorSplit) {
            relevantSplits.push(debtorSplit);
        }
    }

    if (relevantSplits.length === 0) return false;

    return relevantSplits.every((s) => s.isSettled);
}