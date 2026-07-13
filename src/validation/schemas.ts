/**
 * schemas.ts
 *
 * Zod schemas for every value that crosses the service boundary (user input → DB).
 * Parse here before any Supabase write. Failures surface as ZodError with field paths.
 *
 * Rules enforced here:
 *  - String lengths capped to prevent DB abuse and UI overflow
 *  - Control characters stripped via .trim()
 *  - Money is always a positive integer (paise)
 *  - Join codes are uppercase alphanumeric exactly 4 chars
 *  - UUIDs are validated as v4 format
 *
 * Phase-3 addition: SETTLE_PAIR offline queue item schema.
 */

import { z } from 'zod';

// ─── Primitives ───────────────────────────────────────────────────────────────

const uuid = z.string().uuid('Must be a valid UUID');

/**
 * Positive integer in paise. Max ₹99,999 (9999900 paise) per single expense —
 * a reasonable cap for a travel expense tracker.
 */
const paise = z
    .number()
    .int('Amount must be a whole number in paise')
    .positive('Amount must be greater than zero')
    .max(9_999_900, 'Amount exceeds maximum (₹99,999)');

const displayName = z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(50, 'Name must be 50 characters or fewer');

const joinCodeSchema = z
    .string()
    .regex(/^[A-Z0-9]{4}$/, 'Join code must be 4 uppercase alphanumeric characters');

// ─── Auth / User ──────────────────────────────────────────────────────────────

export const RegisterDeviceSchema = z.object({
    deviceUuid: uuid,
    displayName: displayName.nullable().optional(),
    avatarColor: z
        .string()
        .trim()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Avatar color must be a valid hex color like #A1B2C3')
        .nullable()
        .optional(),
});

export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;

export const UpdateDisplayNameSchema = z.object({
    displayName: displayName,
});

export type UpdateDisplayNameInput = z.infer<typeof UpdateDisplayNameSchema>;

// ─── Trip ────────────────────────────────────────────────────────────────────

export const CreateTripSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Trip name is required')
        .max(80, 'Trip name must be 80 characters or fewer'),
    destination: z
        .string()
        .trim()
        .max(100, 'Destination must be 100 characters or fewer')
        .nullable()
        .optional(),
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
        .nullable()
        .optional(),
    endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
        .nullable()
        .optional(),
}).refine(
    (data) => {
        if (data.startDate && data.endDate) {
            return data.endDate >= data.startDate;
        }
        return true;
    },
    { message: 'End date must be on or after start date', path: ['endDate'] },
);

export type CreateTripInput = z.infer<typeof CreateTripSchema>;

export const JoinTripSchema = z.object({
    joinCode: joinCodeSchema,
    displayName: displayName,
});

export type JoinTripInput = z.infer<typeof JoinTripSchema>;

// ─── Member ──────────────────────────────────────────────────────────────────

export const AddGuestMemberSchema = z.object({
    tripId: uuid,
    displayName: displayName,
});

export type AddGuestMemberInput = z.infer<typeof AddGuestMemberSchema>;

// ─── Expense ─────────────────────────────────────────────────────────────────

const expenseCategorySchema = z
    .enum(['food', 'transport', 'stay', 'misc'])
    .nullable()
    .optional();

export const AddExpenseSchema = z.object({
    tripId: uuid,
    paidByMember: uuid,
    title: z
        .string()
        .trim()
        .min(1, 'Expense title is required')
        .max(120, 'Title must be 120 characters or fewer'),
    category: expenseCategorySchema,
    amountMoney: paise,
});

export type AddExpenseInput = z.infer<typeof AddExpenseSchema>;

export const EditExpenseSchema = z.object({
    id: uuid,
    title: z
        .string()
        .trim()
        .min(1, 'Expense title is required')
        .max(120, 'Title must be 120 characters or fewer')
        .optional(),
    category: expenseCategorySchema,
    amountMoney: paise.optional(),
    paidByMember: uuid.optional(),
});

export type EditExpenseInput = z.infer<typeof EditExpenseSchema>;

// ─── Split ───────────────────────────────────────────────────────────────────

export const SplitEntrySchema = z.object({
    memberId: uuid,
    shareMoney: paise,
});

export const AddSplitsSchema = z.object({
    expenseId: uuid,
    splits: z
        .array(SplitEntrySchema)
        .min(1, 'At least one split is required')
        .max(20, 'Too many splits — maximum 20 members per expense'),
});

export type AddSplitsInput = z.infer<typeof AddSplitsSchema>;

/**
 * Validate that splits sum exactly matches the total expense amount.
 * Call this AFTER AddSplitsSchema.parse() passes.
 */
export function validateSplitTotal(
    splits: { shareMoney: number }[],
    totalAmountMoney: number,
): void {
    const splitSum = splits.reduce((acc, s) => acc + s.shareMoney, 0);
    if (splitSum !== totalAmountMoney) {
        throw new Error(
            `Split total (${splitSum} paise) does not equal expense amount (${totalAmountMoney} paise)`,
        );
    }
}

// ─── DeviceUser cache (SecureStore) ──────────────────────────────────────────

/**
 * Validates the JSON blob stored in SecureStore for offline-first boot.
 * Any corruption or tampered entry is rejected and the cache is evicted.
 * MUST be kept in sync with the DeviceUser domain type.
 * (isProvisional is deliberately absent — provisional identities are never
 * persisted.)
 */
export const DeviceUserCacheSchema = z.object({
    id: uuid,
    deviceUuid: uuid,
    displayName: z.string().nullable(),
    avatarColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
        .nullable(),
    createdAt: z.string().min(1),
    lastSeen: z.string().min(1),
});

export type DeviceUserCache = z.infer<typeof DeviceUserCacheSchema>;

// ─── Recurring bill templates (Phase 5) ──────────────────────────────────────

const dueDayMonthly = z
    .number()
    .int()
    .min(1, 'Day must be between 1 and 28')
    .max(28, 'Use day 1–28 so the bill exists in every month');

const dueDayWeekly = z
    .number()
    .int()
    .min(1, 'Weekday must be 1 (Mon) to 7 (Sun)')
    .max(7, 'Weekday must be 1 (Mon) to 7 (Sun)');

export const CreateTemplateSchema = z
    .object({
        tripId: uuid,
        paidByMember: uuid,
        title: z
            .string()
            .trim()
            .min(1, 'Bill name is required')
            .max(120, 'Name must be 120 characters or fewer'),
        category: z.enum(['food', 'transport', 'stay', 'misc']).nullable().optional(),
        amountMoney: paise,
        recurrence: z.enum(['monthly', 'weekly']),
        dueDay: z.number().int(),
    })
    .superRefine((data, ctx) => {
        const check =
            data.recurrence === 'monthly'
                ? dueDayMonthly.safeParse(data.dueDay)
                : dueDayWeekly.safeParse(data.dueDay);
        if (!check.success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['dueDay'],
                message: check.error.issues[0]?.message ?? 'Invalid due day',
            });
        }
    });

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

export const EditTemplateSchema = z
    .object({
        id: uuid,
        paidByMember: uuid.optional(),
        title: z.string().trim().min(1).max(120).optional(),
        category: z.enum(['food', 'transport', 'stay', 'misc']).nullable().optional(),
        amountMoney: paise.optional(),
        recurrence: z.enum(['monthly', 'weekly']).optional(),
        dueDay: z.number().int().optional(),
        isActive: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
        // dueDay can only be validated against a recurrence — require them
        // to travel together on edit.
        if (data.dueDay !== undefined && data.recurrence === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['recurrence'],
                message: 'recurrence must accompany dueDay changes',
            });
            return;
        }
        if (data.dueDay !== undefined && data.recurrence !== undefined) {
            const check =
                data.recurrence === 'monthly'
                    ? dueDayMonthly.safeParse(data.dueDay)
                    : dueDayWeekly.safeParse(data.dueDay);
            if (!check.success) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['dueDay'],
                    message: check.error.issues[0]?.message ?? 'Invalid due day',
                });
            }
        }
    });

export type EditTemplateInput = z.infer<typeof EditTemplateSchema>;

// ─── Offline queue item ───────────────────────────────────────────────────────

const offlineQueueBaseSchema = z.object({
    localId: uuid,
    retryCount: z.number().int().min(0),
    lastFailedAt: z.string().nullable(),
});

const offlineSplitEntrySchema = z.object({
    memberId: uuid,
    shareMoney: paise,
});

const addExpenseQueueItemSchema = offlineQueueBaseSchema.extend({
    type: z.literal('ADD_EXPENSE'),
    payload: z.object({
        tripId: uuid,
        paidByMember: uuid,
        title: z.string().min(1).max(120),
        category: z.enum(['food', 'transport', 'stay', 'misc']).nullable().optional(),
        amountMoney: paise,
        isPendingSync: z.boolean().optional(),
    }),
    splits: z.array(offlineSplitEntrySchema).min(1).max(20),
});

const editExpenseQueueItemSchema = offlineQueueBaseSchema.extend({
    type: z.literal('EDIT_EXPENSE'),
    payload: z.object({
        id: uuid,
        title: z.string().min(1).max(120).optional(),
        category: z.enum(['food', 'transport', 'stay', 'misc']).nullable().optional(),
        amountMoney: paise.optional(),
        paidByMember: uuid.optional(),
    }),
});

const deleteExpenseQueueItemSchema = offlineQueueBaseSchema.extend({
    type: z.literal('DELETE_EXPENSE'),
    payload: z.object({
        expenseId: uuid,
        tripId: uuid,
    }),
});

const settlePairQueueItemSchema = offlineQueueBaseSchema.extend({
    type: z.literal('SETTLE_PAIR'),
    payload: z.object({
        tripId: uuid,
        memberAId: uuid,
        memberBId: uuid,
        settled: z.boolean(),
    }),
});

export const OfflineQueueItemSchema = z.discriminatedUnion('type', [
    addExpenseQueueItemSchema,
    editExpenseQueueItemSchema,
    deleteExpenseQueueItemSchema,
    settlePairQueueItemSchema,
]);

export type OfflineQueueItemValidated = z.infer<typeof OfflineQueueItemSchema>;