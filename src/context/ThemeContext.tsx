/**
 * src/context/ThemeContext.tsx
 *
 * Single React Context that provides:
 *   - Resolved color scheme (ColorScheme)
 *   - Current theme mode ('light' | 'dark')
 *   - Raw user preference ('light' | 'dark' | 'daynight' | 'system')
 *   - setPreference() — change and persist the theme preference
 *   - setAccent() — change and persist the accent color
 *   - accentId — active accent preset ID
 *
 * ThemeProvider is mounted ONCE in app/_layout.tsx.
 * All components call useThemeContext() to access colors.
 * No component calls useThemeMode() or useAccentColor() directly.
 */

import React, {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from 'react';
import { useThemeMode, ThemePreference, ResolvedMode } from '@/hooks/useThemeMode';
import { useAccentColor } from '@/hooks/useAccentColor';
import { ColorScheme, dayScheme, nightScheme } from '@/theme/colors';
import { AccentPreset } from '@/theme/presets';

// ─── Context shape ────────────────────────────────────────────────────────────

type ThemeContextValue = {
    /** Fully resolved color scheme — use this to style components */
    colors: ColorScheme;
    /** 'light' or 'dark' — resolved after applying preference + accent */
    mode: ResolvedMode;
    /** Raw user preference stored in SecureStore */
    preference: ThemePreference;
    /** Change and persist theme preference */
    setPreference: (pref: ThemePreference) => Promise<void>;
    /** The active accent preset */
    accentPreset: AccentPreset;
    /** The active accent preset ID */
    accentId: string;
    /** Change and persist accent color */
    setAccent: (id: string) => Promise<void>;
    /** True while either preference is loading from SecureStore */
    isLoading: boolean;
};

// ─── Create context ───────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

type ThemeProviderProps = {
    children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
    const themeMode = useThemeMode();
    const accentColor = useAccentColor();

    // Compose the final color scheme:
    // 1. Pick base scheme (day or night)
    // 2. Inject user's accent tokens
    const colors = useMemo<ColorScheme>(() => {
        const base = themeMode.mode === 'dark' ? nightScheme : dayScheme;
        return {
            ...base,
            accent: accentColor.preset.accent,
            accentLight: accentColor.preset.accentLight,
            accentDim: accentColor.preset.accentDim,
        };
    }, [themeMode.mode, accentColor.preset]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            colors,
            mode: themeMode.mode,
            preference: themeMode.preference,
            setPreference: themeMode.setPreference,
            accentPreset: accentColor.preset,
            accentId: accentColor.accentId,
            setAccent: accentColor.setAccent,
            isLoading: themeMode.isLoading || accentColor.isLoading,
        }),
        [colors, themeMode, accentColor],
    );

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

/**
 * Primary hook for all component color access.
 *
 * Usage:
 *   const { colors } = useThemeContext();
 *   <View style={{ backgroundColor: colors.card }}>
 *
 * For convenience, most components destructure colors immediately:
 *   const { colors } = useThemeContext();
 *   const { text, accent, card } = colors;
 */
export function useThemeContext(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error(
            '[useThemeContext] Must be called inside <ThemeProvider>. ' +
            'Ensure ThemeProvider wraps the root _layout.tsx.',
        );
    }
    return ctx;
}

/**
 * Shorthand for components that only need colors.
 * Most common usage pattern.
 */
export function useThemeColors(): ColorScheme {
    return useThemeContext().colors;
}