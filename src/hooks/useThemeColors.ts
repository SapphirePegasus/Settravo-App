/**
 * src/hooks/useThemeColors.ts
 *
 * Drop-in replacement for the old useThemeColors hook.
 *
 * OLD behaviour: read useColorScheme() directly, return light/dark object.
 * NEW behaviour: read from ThemeContext (which handles daynight, system,
 *   accent injection, and SecureStore persistence) and return ColorScheme.
 *
 * All existing call sites work unchanged:
 *   const colors = useThemeColors();
 *   <View style={{ backgroundColor: colors.bg }} />
 *
 * The exported ThemeColors type is an alias for ColorScheme so any file
 * that imports `ThemeColors` continues to compile.
 */

import { ColorScheme } from '@/theme/colors';
import { useThemeColors as _useThemeColors } from '@/context/ThemeContext';

/** Public type alias — matches old usage `ThemeColors` across the codebase. */
export type ThemeColors = ColorScheme;

/**
 * Returns the fully resolved color scheme for the current theme mode
 * and accent preference.
 *
 * Must be called inside a component tree wrapped by <ThemeProvider>.
 */
export function useThemeColors(): ThemeColors {
  return _useThemeColors();
}