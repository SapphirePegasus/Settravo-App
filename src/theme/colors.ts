/**
 * src/theme/colors.ts
 *
 * LAYER 1 — Raw palette (private, never imported directly by components)
 * LAYER 2 — Semantic tokens (exported, the ONLY color reference in all components)
 *
 * Rules:
 *  - No component ever references a hex string directly.
 *  - Accent tokens are placeholders; they are injected at runtime by useThemeColors().
 *  - All additions go here first, then surface in useThemeColors().
 */

// ─── Layer 1: Raw palette (private) ──────────────────────────────────────────

const palette = {
    // Greens
    green500: '#22C55E',
    green600: '#16A34A',
    green100: '#DCFCE7',
    green900: '#14532D',

    // Reds
    red400: '#F87171',
    red600: '#DC2626',
    red100: '#FEE2E2',

    // Ambers
    amber400: '#FBBF24',
    amber600: '#D97706',
    amber100: '#FEF3C7',

    // Grays (light mode)
    gray50: '#F5F6F8',
    gray100: '#F0F0F5',
    gray200: '#E8E9EF',
    gray400: '#9CA3AF',
    gray500: '#6B6B80',
    gray900: '#0D0D14',

    // Darks (dark mode)
    dark900: '#0A0B10',
    dark800: '#13141C',
    dark700: '#1A1B26',
    dark600: '#252636',
    dark500: '#2E2F42',
    dark400: '#4B5563',
    dark300: '#8888AA',
    dark100: '#F0F1FF',

    // Pure
    white: '#FFFFFF',
    black: '#000000',
} as const;

// ─── Layer 2: Semantic token shape ───────────────────────────────────────────

export type ColorScheme = {
    // Backgrounds
    bg: string;
    surface: string;
    card: string;
    cardBorder: string;

    // Text
    text: string;
    textSecondary: string;
    textDisabled: string;
    textInverse: string;

    // Accent — injected at runtime from user's color preference
    accent: string;
    accentLight: string;
    accentDim: string;

    // Status
    success: string;
    successMuted: string;
    danger: string;
    dangerMuted: string;
    warning: string;
    warningMuted: string;

    // Financial semantics (distinct from status for semantic clarity)
    owed: string;       // money owed TO you
    owe: string;        // money you OWE
    settled: string;    // settled/neutral state

    // UI chrome
    separator: string;
    overlay: string;
    placeholder: string;
    icon: string;
    statusBarStyle: 'light' | 'dark';
};

// ─── Day (light) scheme ───────────────────────────────────────────────────────
// Accent placeholders are overwritten in useThemeColors() at runtime.
const ACCENT_PLACEHOLDER = '#22C55E';
const ACCENT_LIGHT_PLACEHOLDER = '#DCFCE7';
const ACCENT_DIM_PLACEHOLDER = '#86EFAC';

export const dayScheme: ColorScheme = {
    bg: palette.gray50,
    surface: palette.white,
    card: palette.white,
    cardBorder: palette.gray200,

    text: palette.gray900,
    textSecondary: palette.gray500,
    textDisabled: palette.gray400,
    textInverse: palette.white,

    accent: ACCENT_PLACEHOLDER,
    accentLight: ACCENT_LIGHT_PLACEHOLDER,
    accentDim: ACCENT_DIM_PLACEHOLDER,

    success: palette.green600,
    successMuted: palette.green100,
    danger: palette.red600,
    dangerMuted: palette.red100,
    warning: palette.amber600,
    warningMuted: palette.amber100,

    owed: palette.green600,
    owe: palette.red600,
    settled: palette.gray400,

    separator: palette.gray100,
    overlay: 'rgba(0,0,0,0.40)',
    placeholder: palette.gray400,
    icon: palette.gray500,
    statusBarStyle: 'dark',
};

// ─── Night (dark) scheme ──────────────────────────────────────────────────────

export const nightScheme: ColorScheme = {
    bg: palette.dark900,
    surface: palette.dark800,
    card: palette.dark700,
    cardBorder: palette.dark600,

    text: palette.dark100,
    textSecondary: palette.dark300,
    textDisabled: palette.dark400,
    textInverse: palette.white,

    accent: ACCENT_PLACEHOLDER,
    accentLight: ACCENT_LIGHT_PLACEHOLDER,
    accentDim: ACCENT_DIM_PLACEHOLDER,

    success: palette.green500,
    successMuted: palette.green900,
    danger: palette.red400,
    dangerMuted: '#3B0000',
    warning: palette.amber400,
    warningMuted: '#3B2200',

    owed: palette.green500,
    owe: palette.red400,
    settled: palette.dark400,

    separator: '#1E1F2E',
    overlay: 'rgba(0,0,0,0.60)',
    placeholder: palette.dark400,
    icon: palette.dark300,
    statusBarStyle: 'light',
};