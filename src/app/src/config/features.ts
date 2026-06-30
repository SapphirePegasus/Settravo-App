/**
 * src/config/features.ts
 *
 * Feature flag registry.
 *
 * HOW TO USE:
 *   - Tab bar reads TAB_* flags to include/exclude tabs.
 *   - Stack navigators read SCREEN_* flags to register/omit routes.
 *   - Components read FEATURE_* flags to show/hide UI elements.
 *
 * HOW TO TOGGLE:
 *   Flip the boolean here. ONE change, ONE file.
 *   Never modify navigation layouts to disable features during development.
 *
 * All values are `as const` — TypeScript will error if a flag is mistyped.
 */

export const FEATURES = {
    // ─── Tabs ──────────────────────────────────────────────────────────────────
    /** Groups tab in bottom tab bar */
    TAB_GROUPS: true,
    /** Activity tab in bottom tab bar */
    TAB_ACTIVITY: true,
    /** Statistics tab in bottom tab bar */
    TAB_STATISTICS: true,

    // ─── Screens ───────────────────────────────────────────────────────────────
    /** Group-scoped activity timeline screen */
    SCREEN_GROUP_ACTIVITY: true,
    /** User-level cross-group activity timeline screen */
    SCREEN_USER_ACTIVITY: true,
    /** Share group / QR screen */
    SCREEN_SHARE_GROUP: true,
    /** Settlements screen inside a group */
    SCREEN_SETTLEMENTS: true,
    /** Global statistics screen */
    SCREEN_STATISTICS: true,
    /** Create/Edit group screen */
    SCREEN_CREATE_GROUP: true,

    // ─── Features ──────────────────────────────────────────────────────────────
    /** Auto-fetch Pixabay image on group name change */
    FEATURE_GROUP_IMAGE_FETCH: true,
    /** Shuffle button to refetch a new image for the same query */
    FEATURE_IMAGE_SHUFFLE: true,
    /** Day/Night automatic theme switching at 05:00/17:00 */
    FEATURE_DAY_NIGHT_THEME: true,
    /** User accent color preference (6 preset pills) */
    FEATURE_COLOR_PREFERENCE: true,
    /** Haptic feedback on success/destructive/toggle actions */
    FEATURE_HAPTICS: true,
    /** Skeleton loaders in place of spinners on list screens */
    FEATURE_SKELETON_LOADERS: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;