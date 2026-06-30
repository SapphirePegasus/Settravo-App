/**
 * src/theme/spacing.ts
 *
 * 4-point grid spacing system.
 * All margin/padding values in the app must come from this token set.
 * Never use arbitrary numeric values inline.
 *
 * Usage:
 *   import { spacing } from '@/theme';
 *   style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}
 */

export const spacing = {
    /** 4pt — tight gaps between inline elements */
    xs: 4,
    /** 8pt — small internal padding, icon-to-label gaps */
    sm: 8,
    /** 16pt — standard horizontal screen margin, card padding */
    md: 16,
    /** 24pt — section gaps, large card padding */
    lg: 24,
    /** 32pt — between major sections */
    xl: 32,
    /** 48pt — screen-level top/bottom breathing room */
    xxl: 48,
} as const;

export type SpacingKey = keyof typeof spacing;