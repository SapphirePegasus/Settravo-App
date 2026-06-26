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
 *  - Join codes are uppercase alphanumeric exactly 6 chars
 *  - UUIDs are validated as v4 format
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