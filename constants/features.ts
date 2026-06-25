/**
 * features.ts
 *
 * Feature flags. Flip to true when the feature is ready.
 * Never scatter __DEV__ checks in UI components — check here instead.
 *
 * Phase 5: EXPENSE_EDIT_ENABLED and GUEST_WEB_VIEW_ENABLED are now live.
 */

export const FEATURES = {
    /** Packing list tab — post-MVP. Keep false until a future phase. */
    PACKING_LIST_ENABLED: false,

    /**
     * Guest web view for non-app users.
     * Phase 4 complete — flip to true once EAS Hosting is deployed
     * and EXPO_PUBLIC_GUEST_BASE_URL is set in your .env.local.
     */
    GUEST_WEB_VIEW_ENABLED: true,

    /**
     * Expense edit (title, amount, category without delete+recreate).
     * Phase 5 complete — editExpense() is implemented in expenseService.
     */
    EXPENSE_EDIT_ENABLED: true,
} as const;