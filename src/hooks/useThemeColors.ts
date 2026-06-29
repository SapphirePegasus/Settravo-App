/**
 * src/hooks/useThemeColors.ts
 *
 * Drop-in shim for all existing `useThemeColors()` call sites.
 *
 * OLD behaviour: read useColorScheme() directly, return a light/dark object.
 * NEW behaviour: delegates to ThemeContext which handles:
 *   - 4-mode theme (light / dark / daynight / system)
 *   - Accent color injection
 *   - SecureStore persistence
 *
 * All existing imports work unchanged:
 *   import { useThemeColors } from '../hooks/useThemeColors';
 *   const colors = useThemeColors();  // ← same API, richer implementation
 *
 * The ThemeColors type alias satisfies any file that imports `ThemeColors`
 * as a named type.
 */

import type { ColorScheme } from '@/theme/colors';
import { useThemeColors as _useThemeColors } from '@/context/ThemeContext';

/** Public type alias — satisfies all existing `ThemeColors` type references. */
export type ThemeColors = ColorScheme;

/**
 * Returns the fully resolved color scheme.
 * Component must be inside a <ThemeProvider> tree (guaranteed by root _layout.tsx).
 */
export function useThemeColors(): ThemeColors {
    return _useThemeColors();
}