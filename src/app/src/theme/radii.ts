/**
 * src/theme/radii.ts
 *
 * Border radius token set.
 * All borderRadius values in the app must reference these tokens.
 *
 * Usage:
 *   import { radii } from '@/theme';
 *   style={{ borderRadius: radii.md }}
 */

export const radii = {
    /** 0 — sharp corners (dividers, full-bleed images) */
    none: 0,
    /** 4 — very subtle rounding (badges, chips tight) */
    xs: 4,
    /** 8 — small elements (tags, small buttons) */
    sm: 8,
    /** 12 — standard cards */
    md: 12,
    /** 16 — large cards, modals */
    lg: 16,
    /** 24 — bottom sheets, hero cards */
    xl: 24,
    /** 9999 — pill/capsule shapes (avatar, FAB, pill buttons) */
    full: 9999,
} as const;

export type RadiusKey = keyof typeof radii;