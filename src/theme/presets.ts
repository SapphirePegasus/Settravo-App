/**
 * src/theme/presets.ts
 *
 * Accent color preset definitions.
 * This is the ONLY place accent colors are defined.
 * All changes to the color palette go here — nowhere else.
 *
 * Each preset supplies three tokens injected into ColorScheme at runtime:
 *   accent      — primary brand/action color
 *   accentLight — tinted background for chips, badges, highlights
 *   accentDim   — desaturated version for disabled/inactive states
 *   contrast    — text color to use ON the accent background (WCAG AA)
 */

export type AccentPreset = {
    readonly id: string;
    readonly label: string;
    readonly accent: string;
    readonly accentLight: string;
    readonly accentDim: string;
    readonly contrast: string;   // '#FFFFFF' or '#000000' — WCAG AA safe
};

export const ACCENT_PRESETS: readonly AccentPreset[] = [
    {
        id: 'forest',
        label: 'Forest',
        accent: '#22C55E',
        accentLight: '#DCFCE7',
        accentDim: '#86EFAC',
        contrast: '#FFFFFF',
    },
    {
        id: 'ocean',
        label: 'Ocean',
        accent: '#3B82F6',
        accentLight: '#DBEAFE',
        accentDim: '#93C5FD',
        contrast: '#FFFFFF',
    },
    {
        id: 'violet',
        label: 'Violet',
        accent: '#8B5CF6',
        accentLight: '#EDE9FE',
        accentDim: '#C4B5FD',
        contrast: '#FFFFFF',
    },
    {
        id: 'sunset',
        label: 'Sunset',
        accent: '#F97316',
        accentLight: '#FFEDD5',
        accentDim: '#FDBA74',
        contrast: '#FFFFFF',
    },
    {
        id: 'rose',
        label: 'Rose',
        accent: '#EC4899',
        accentLight: '#FCE7F3',
        accentDim: '#F9A8D4',
        contrast: '#FFFFFF',
    },
    {
        id: 'gold',
        label: 'Gold',
        accent: '#EAB308',
        accentLight: '#FEF9C3',
        accentDim: '#FDE047',
        contrast: '#000000', // Yellow on white/light needs dark text for contrast
    },
] as const;

/** Default preset ID for new users */
export const DEFAULT_ACCENT_ID = 'forest' as const;

/** Look up a preset by ID — always returns a valid preset (falls back to default) */
export function getAccentPreset(id: string): AccentPreset {
    return (
        ACCENT_PRESETS.find((p) => p.id === id) ??
        ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!
    );
}