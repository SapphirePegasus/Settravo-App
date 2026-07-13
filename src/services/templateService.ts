/**
 * templateService.ts
 *
 * All recurring-bill template operations (Phase 5).
 *
 * Rules (same contract as every other service):
 *  - All inputs Zod-validated before any network call.
 *  - Money is always integer paise.
 *  - Returns domain types only; raw DB rows never leave this file.
 *  - RLS is the authorization gate for CRUD; the materialization RPC
 *    performs its own membership check.
 *
 * Recurring bills are ONLINE features by design: templates describe future
 * money movements and must have a single authoritative definition. There is
 * no offline queue for template CRUD — the screens guard on connectivity.
 * (Materialized EXPENSES, of course, flow through the normal offline cache.)
 */

import { supabase } from '../lib/supabase';
import { AppError } from '../errors/AppError';
import type { Expense, ExpenseTemplate } from '../types/domain';
import type { Database } from '../types/supabase';
import {
    CreateTemplateSchema,
    EditTemplateSchema,
    type CreateTemplateInput,
    type EditTemplateInput,
} from '../validation/schemas';

type TemplateRow = Database['public']['Tables']['TravelAppExpenseTemplates']['Row'];
type ExpenseRow = Database['public']['Tables']['TravelAppExpenses']['Row'];

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapTemplate(row: TemplateRow): ExpenseTemplate {
    return {
        id: row.id,
        tripId: row.trip_id,
        createdByDevice: row.created_by_device,
        paidByMember: row.paid_by_member,
        title: row.title,
        category: row.category as ExpenseTemplate['category'],
        amountMoney: row.amount_money,
        splitMode: row.split_mode as ExpenseTemplate['splitMode'],
        recurrence: row.recurrence as ExpenseTemplate['recurrence'],
        dueDay: row.due_day,
        startDate: row.start_date,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

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

function classify(error: { code?: string; message: string }, op: string): AppError {
    if (error.code === '42501') {
        return new AppError('FORBIDDEN', `[templateService] ${op}: ${error.message}`, error);
    }
    if (error.code === 'P0005') {
        return new AppError('CONFLICT', 'This group has reached the maximum number of recurring bills.', error);
    }
    return new AppError('SERVER', `[templateService] ${op}: ${error.message}`, error);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function fetchTemplates(tripId: string): Promise<ExpenseTemplate[]> {
    const { data, error } = await supabase
        .from('TravelAppExpenseTemplates')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });

    if (error) throw classify(error, 'fetchTemplates');
    return (data ?? []).map(mapTemplate);
}

/**
 * Count of ACTIVE templates created by this device across all trips —
 * powers the free-tier limit check in the UI without a server round trip
 * per keystroke.
 */
export async function countMyActiveTemplates(deviceId: string): Promise<number> {
    const { count, error } = await supabase
        .from('TravelAppExpenseTemplates')
        .select('id', { count: 'exact', head: true })
        .eq('created_by_device', deviceId)
        .eq('is_active', true);

    if (error) throw classify(error, 'countMyActiveTemplates');
    return count ?? 0;
}

export async function createTemplate(
    input: CreateTemplateInput,
    deviceId: string,
): Promise<ExpenseTemplate> {
    const validated = CreateTemplateSchema.parse(input);

    const { data, error } = await supabase
        .from('TravelAppExpenseTemplates')
        .insert({
            trip_id: validated.tripId,
            created_by_device: deviceId,
            paid_by_member: validated.paidByMember,
            title: validated.title,
            category: validated.category ?? null,
            amount_money: validated.amountMoney,
            split_mode: 'equal',
            recurrence: validated.recurrence,
            due_day: validated.dueDay,
        })
        .select()
        .single();

    if (error || !data) throw classify(error ?? { message: 'no row returned' }, 'createTemplate');
    return mapTemplate(data);
}

export async function editTemplate(input: EditTemplateInput): Promise<ExpenseTemplate> {
    const validated = EditTemplateSchema.parse(input);

    const patch: Database['public']['Tables']['TravelAppExpenseTemplates']['Update'] = {};
    if (validated.title !== undefined) patch.title = validated.title;
    if (validated.category !== undefined) patch.category = validated.category;
    if (validated.amountMoney !== undefined) patch.amount_money = validated.amountMoney;
    if (validated.paidByMember !== undefined) patch.paid_by_member = validated.paidByMember;
    if (validated.recurrence !== undefined) patch.recurrence = validated.recurrence;
    if (validated.dueDay !== undefined) patch.due_day = validated.dueDay;
    if (validated.isActive !== undefined) patch.is_active = validated.isActive;

    const { data, error } = await supabase
        .from('TravelAppExpenseTemplates')
        .update(patch)
        .eq('id', validated.id)
        .select()
        .single();

    if (error || !data) throw classify(error ?? { message: 'no row returned' }, 'editTemplate');
    return mapTemplate(data);
}

/**
 * Delete a template. Already-materialized expenses are preserved
 * (template_id is set NULL by the FK) — deleting a recurring bill must
 * never rewrite financial history.
 */
export async function deleteTemplate(templateId: string): Promise<void> {
    const { error } = await supabase
        .from('TravelAppExpenseTemplates')
        .delete()
        .eq('id', templateId);

    if (error) throw classify(error, 'deleteTemplate');
}

// ─── Materialization ──────────────────────────────────────────────────────────

/**
 * Ask the server to create any due, missing recurring expenses for this
 * trip. Returns the created expenses (usually empty). Idempotent — a
 * concurrent call from another device cannot double-create.
 */
export async function materializeRecurring(tripId: string): Promise<Expense[]> {
    const { data, error } = await supabase.rpc('settravo_materialize_recurring', {
        p_trip_id: tripId,
    });

    if (error) throw classify(error, 'materializeRecurring');
    return ((data ?? []) as ExpenseRow[]).map(mapExpense);
}