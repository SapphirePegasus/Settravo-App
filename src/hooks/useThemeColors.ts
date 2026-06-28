/**
 * useThemeColors.ts
 *
 * Returns the correct colour token set for the current system appearance.
 * All screens and components call this hook instead of defining their own
 * light/dark objects.
 *
 * Usage:
 *   const colors = useThemeColors();
 *   <View style={{ backgroundColor: colors.bg }} />
 */

import { useColorScheme } from 'react-native';
import { Colors } from '../theme/colors';

// Derive a widened type where each value is `string` not a literal —
// this makes light and dark both assignable without losing autocompletion.
export type ThemeColors = {
    [K in keyof typeof Colors.light]: string;
};

export function useThemeColors(): ThemeColors {
    const scheme = useColorScheme();
    return (scheme === 'dark' ? Colors.dark : Colors.light) as ThemeColors;
}