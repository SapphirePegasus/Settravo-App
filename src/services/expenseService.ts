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
 *
 * Phase-2 change — settle contract:
 *  - markSettledBetweenMembers / unmarkSettledBetweenMembers (one-directional,
 *    returned only a count) are REPLACED by settlePairBetweenMembers, backed
 *    by the settravo_settle_pair RPC. It flips BOTH directions of unsettled
 *    debt between two members inside one DB transaction and RETURNS the exact
 *    split rows it mutated. The caller mirrors those rows into the store —
 *    local state can no longer diverge from the server.
 *
 * Offline flow (called from the offline sync hook):
 *  - addExpenseWithSplits() is the online path.
 *  - The offline queue in tripStore stores the same payload.
 *  - replayOfflineQueue() in useOfflineSync replays them on reconnect.
 */

import { supabase } from '../lib/supabase';
import type { Expense, Split } from '../types/domain';
import type { Database } from '../types/supabase';
import { AppError } from '../errors/AppError';
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
 * RLS enforces that only the payer (or any member, when the payer is a
 * guest) can edit.
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
 * RLS enforces that only the payer (or any member, for guest-paid) can delete.
 */
export async function deleteExpense(expenseId: string): Promise<void> {
    const { error } = await supabase
        .from('TravelAppExpenses')
        .delete()
        .eq('id', expenseId);

    if (error) throw new Error(`[expenseService] deleteExpense: ${error.message}`);
}

// ─── Settle (Phase-2 contract) ────────────────────────────────────────────────

/**
 * Settle (or un-settle) ALL unsettled debt between two members of a trip.
 *
 * Backed by the settravo_settle_pair RPC (SECURITY DEFINER, single txn):
 *  - Verifies the caller is a member of the trip.
 *  - Flips is_settled on every qualifying split in BOTH directions
 *    (memberA→memberB and memberB→memberA) — matching what the pairwise
 *    settlement card on screen actually represents.
 *  - Returns the exact rows it mutated.
 *
 * The caller MUST apply the returned splits to the expense store
 * (applyServerSplits) instead of guessing which rows changed. This is the
 * fix for the "settle button is inconsistent" class of bugs.
 *
 * @returns the mutated split rows (may be empty if nothing qualified).
 */
export async function settlePairBetweenMembers(
    tripId: string,
    memberAId: string,
    memberBId: string,
    settled: boolean,
): Promise<Split[]> {
    const { data, error } = await supabase.rpc('settravo_settle_pair', {
        p_trip_id: tripId,
        p_member_a: memberAId,
        p_member_b: memberBId,
        p_settled: settled,
    });

    if (error) {
        // 42501 is raised by the RPC when the caller isn't a trip member.
        const code = (error as { code?: string }).code === '42501' ? 'FORBIDDEN' : 'SERVER';
        throw new AppError(
            code,
            `[expenseService] settravo_settle_pair failed: ${error.message}`,
            error,
        );
    }

    return ((data ?? []) as SplitRow[]).map(mapSplit);
}