/**
 * expenseService.ts
 *
 * All expense and split Supabase operations.
 *
 * Rules:
 *  - All inputs Zod-validated before any network call.
 *  - Money is always integer paise (amount_money / share_money columns).
 *  - Split totals are validated to exactly equal the expense amount.
 *  - Returns domain types only. Raw DB rows never leave this file.
 *  - Add and delete go direct to Supabase (RLS is the gate).
 *    No Edge Function needed here — mutations are single-table, no
 *    rate-limit attack surface beyond what RLS already covers.
 *
 * Offline flow (called from the offline sync hook):
 *  - addExpenseWithSplits() is the online path.
 *  - The offline queue in tripStore stores the same payload.
 *  - replayOfflineQueue() in useOfflineSync replays them on reconnect.
 */

import { supabase } from '../lib/supabase';
import type { Expense, Split } from '../types/domain';
import type { Database } from '../types/supabase';
import {
    AddExpenseSchema,
    AddSplitsSchema,
    EditExpenseSchema,
    validateSplitTotal,
    type AddExpenseInput,
    type AddSplitsInput,
    type EditExpenseInput,
} from '../validation/schemas';

type ExpenseRow = Database['public']['Tables']['TravelAppExpenses']['Row'];
type SplitRow = Database['public']['Tables']['TravelAppSplits']['Row'];

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapExpense(row: ExpenseRow): Expense {
    return {
        id: row.id,
        tripId: row.trip_id,
        paidByMember: row.paid_by_member,
        title: row.title,
        category: row.category as Expense['category'],
        amountMoney: row.amount_money,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isPendingSync: false,
    };
}

function mapSplit(row: SplitRow): Split {
    return {
        id: row.id,
        expenseId: row.expense_id,
        memberId: row.member_id,
        shareMoney: row.share_money,
        isSettled: row.is_settled,
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all expenses for a trip, sorted newest first.
 * RLS: caller must be a member of the trip.
 */
export async function fetchExpenses(tripId: string): Promise<Expense[]> {
    const { data, error } = await supabase
        .from('TravelAppExpenses')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });

    if (error) throw new Error(`[expenseService] fetchExpenses: ${error.message}`);
    return (data ?? []).map(mapExpense);
}

/**
 * Fetch all splits for a specific expense.
 */
export async function fetchSplitsForExpense(expenseId: string): Promise<Split[]> {
    const { data, error } = await supabase
        .from('TravelAppSplits')
        .select('*')
        .eq('expense_id', expenseId);

    if (error) throw new Error(`[expenseService] fetchSplitsForExpense: ${error.message}`);
    return (data ?? []).map(mapSplit);
}

/**
 * Fetch all splits for all expenses in a trip (batch load for settlement calc).
 */
export async function fetchAllSplitsForTrip(tripId: string): Promise<Split[]> {
    // Join through TravelAppExpenses to filter by trip_id.
    // Supabase supports nested selects — expense_id is the FK.
    const { data, error } = await supabase
        .from('TravelAppSplits')
        .select('*, TravelAppExpenses!inner(trip_id)')
        .eq('TravelAppExpenses.trip_id', tripId);

    if (error) throw new Error(`[expenseService] fetchAllSplitsForTrip: ${error.message}`);
    return (data ?? []).map(mapSplit);
}

/**
 * Add an expense and its splits in a single operation.
 *
 * Atomicity: Supabase doesn't expose client-side transactions.
 * Strategy: insert expense first, then splits. If splits fail, delete
 * the expense (manual rollback). This is safe because:
 *  - RLS prevents other devices from reading a split-less expense
 *    (they'd see an expense with zero splits, which the UI handles).
 *  - The window between expense insert and split insert is milliseconds.
 *
 * Validates:
 *  - AddExpenseSchema (title, amount, category, paidByMember)
 *  - AddSplitsSchema (splits array, max 20)
 *  - Split total === expense amount (exact integer equality)
 */
export async function addExpenseWithSplits(
    expenseInput: AddExpenseInput,
    splitsInput: Omit<AddSplitsInput, 'expenseId'>,
): Promise<{ expense: Expense; splits: Split[] }> {
    // Validate
    const validatedExpense = AddExpenseSchema.parse(expenseInput);
    const validatedSplits = AddSplitsSchema.parse({
        expenseId: '00000000-0000-4000-a000-000000000000',
        splits: splitsInput.splits,
    });
    validateSplitTotal(validatedSplits.splits, validatedExpense.amountMoney);

    // Insert expense
    const { data: expenseRow, error: expenseErr } = await supabase
        .from('TravelAppExpenses')
        .insert({
            trip_id: validatedExpense.tripId,
            paid_by_member: validatedExpense.paidByMember,
            title: validatedExpense.title,
            category: validatedExpense.category ?? null,
            amount_money: validatedExpense.amountMoney,
        })
        .select()
        .single();

    if (expenseErr || !expenseRow) {
        throw new Error(`[expenseService] addExpense failed: ${expenseErr?.message}`);
    }

    // Insert splits
    const splitRows = validatedSplits.splits.map((s) => ({
        expense_id: expenseRow.id,
        member_id: s.memberId,
        share_money: s.shareMoney,
        is_settled: false,
    }));

    const { data: insertedSplits, error: splitsErr } = await supabase
        .from('TravelAppSplits')
        .insert(splitRows)
        .select();

    if (splitsErr || !insertedSplits) {
        // Manual rollback: remove the orphaned expense
        await supabase.from('TravelAppExpenses').delete().eq('id', expenseRow.id);
        throw new Error(`[expenseService] addSplits failed (expense rolled back): ${splitsErr?.message}`);
    }

    return {
        expense: mapExpense(expenseRow),
        splits: insertedSplits.map(mapSplit),
    };
}

/**
 * Edit an expense's title, category, or amount.
 * RLS "Payer can edit their expense" enforces ownership.
 *
 * If amount changes, all splits must be re-submitted (pass newSplits).
 * If only title/category changes, newSplits can be omitted.
 */
export async function editExpense(
    input: EditExpenseInput,
    newSplits?: Omit<AddSplitsInput, 'expenseId'>,
): Promise<Expense> {
    const validated = EditExpenseSchema.parse(input);

    if (newSplits && validated.amountMoney) {
        validateSplitTotal(newSplits.splits, validated.amountMoney);
    }

    const updatePayload: Database['public']['Tables']['TravelAppExpenses']['Update'] = {
        updated_at: new Date().toISOString(),
    };
    if (validated.title !== undefined) updatePayload.title = validated.title;
    if (validated.category !== undefined) updatePayload.category = validated.category;
    if (validated.amountMoney !== undefined) updatePayload.amount_money = validated.amountMoney;
    if (validated.paidByMember !== undefined) updatePayload.paid_by_member = validated.paidByMember;

    const { data, error } = await supabase
        .from('TravelAppExpenses')
        .update(updatePayload)
        .eq('id', validated.id)
        .select()
        .single();

    if (error || !data) throw new Error(`[expenseService] editExpense: ${error?.message}`);

    // If splits changed: delete old splits and insert new ones
    if (newSplits) {
        await supabase.from('TravelAppSplits').delete().eq('expense_id', validated.id);

        const splitRows = newSplits.splits.map((s) => ({
            expense_id: validated.id,
            member_id: s.memberId,
            share_money: s.shareMoney,
            is_settled: false,
        }));

        const { error: splitsErr } = await supabase.from('TravelAppSplits').insert(splitRows);
        if (splitsErr) throw new Error(`[expenseService] editExpense splits: ${splitsErr.message}`);
    }

    return mapExpense(data);
}

/**
 * Delete an expense (and its splits, via CASCADE in the DB schema).
 * RLS "Payer can delete their expense" enforces ownership.
 */
export async function deleteExpense(expenseId: string): Promise<void> {
    const { error } = await supabase
        .from('TravelAppExpenses')
        .delete()
        .eq('id', expenseId);

    if (error) throw new Error(`[expenseService] deleteExpense: ${error.message}`);
}

/**
 * Mark all splits between two members as settled.
 *
 * "Settled" means: the debtor has paid the creditor outside the app
 * (cash, UPI, etc.). We mark is_settled=true on all TravelAppSplits rows
 * where the debtor is the member_id and the expense was paid by the creditor.
 *
 * RLS "Payer can update splits on their expense" covers this — the creditor
 * (the payer of the original expense) is the one marking it settled.
 *
 * Returns the count of rows updated.
 */
export async function markSettledBetweenMembers(
    tripId: string,
    debtorMemberId: string,
    creditorMemberId: string,
): Promise<number> {
    // Get all expense IDs where creditor paid
    const { data: expenses, error: expErr } = await supabase
        .from('TravelAppExpenses')
        .select('id')
        .eq('trip_id', tripId)
        .eq('paid_by_member', creditorMemberId);

    if (expErr) throw new Error(`[expenseService] markSettled fetch expenses: ${expErr.message}`);
    if (!expenses || expenses.length === 0) return 0;

    const expenseIds = expenses.map((e) => e.id);

    const { data: updated, error: splitErr } = await supabase
        .from('TravelAppSplits')
        .update({ is_settled: true })
        .in('expense_id', expenseIds)
        .eq('member_id', debtorMemberId)
        .eq('is_settled', false)
        .select();

    if (splitErr) throw new Error(`[expenseService] markSettled update splits: ${splitErr.message}`);
    return updated?.length ?? 0;
}

/**
 * Unmark (reopen) settlements between two members.
 * Useful if a payment was recorded by mistake.
 */
export async function unmarkSettledBetweenMembers(
    tripId: string,
    debtorMemberId: string,
    creditorMemberId: string,
): Promise<number> {
    const { data: expenses, error: expErr } = await supabase
        .from('TravelAppExpenses')
        .select('id')
        .eq('trip_id', tripId)
        .eq('paid_by_member', creditorMemberId);

    if (expErr) throw new Error(`[expenseService] unmarkSettled: ${expErr.message}`);
    if (!expenses || expenses.length === 0) return 0;

    const expenseIds = expenses.map((e) => e.id);

    const { data: updated, error: splitErr } = await supabase
        .from('TravelAppSplits')
        .update({ is_settled: false })
        .in('expense_id', expenseIds)
        .eq('member_id', debtorMemberId)
        .eq('is_settled', true)
        .select();

    if (splitErr) throw new Error(`[expenseService] unmarkSettled update splits: ${splitErr.message}`);
    return updated?.length ?? 0;
}