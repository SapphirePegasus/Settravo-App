/**
 * src/components/ui/Icon.tsx
 *
 * The ONLY way icons should be rendered in this app. Never import
 * `Ionicons` directly in a screen/component, and never render emoji
 * characters as icons.
 *
 * Usage:
 *   <Icon name="nav.home" active={focused} size={22} color={colors.icon} />
 *
 * - `name` is a dotted semantic key from src/config/icons.ts (autocompletes
 *   and type-checks against the registry — typo a key and TS fails the build).
 * - `active` selects the filled vs. outline glyph variant. Defaults to false.
 * - `color` must always come from theme tokens (useThemeColors()) — never a
 *   hardcoded hex, so the icon respects day/night and accent preference.
 * - `size` defaults to 22, the standard inline icon size used across the app.
 *
 * To swap which glyph renders for a given key, edit src/config/icons.ts —
 * never edit this file or call sites for a simple glyph change.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { resolveIcon, type IconKey } from '@/config/icons';

export type IconProps = {
    /** Dotted semantic key, e.g. "nav.home" or "category.food". */
    name: IconKey;
    /** Selected/current state — swaps to the filled glyph variant. */
    active?: boolean;
    /** Glyph size in px. Defaults to 22 (standard inline icon size). */
    size?: number;
    /** Must come from theme tokens — never a hardcoded hex. */
    color: string;
    style?: StyleProp<TextStyle>;
    /** Forwarded for icon-only pressables that need a screen-reader label;
     *  omit for purely decorative icons already paired with visible text. */
    accessibilityLabel?: string;
};

function IconBase({ name, active = false, size = 22, color, style, accessibilityLabel }: IconProps) {
    const definition = resolveIcon(name);
    const glyph = active ? definition.active : definition.inactive;

    // Only one family today (Ionicons). Switch is kept explicit so adding a
    // second family later (e.g. MaterialCommunityIcons) is a one-line addition
    // here rather than a refactor of every call site.
    switch (definition.family) {
        case 'ionicons':
        default:
            return (
                <Ionicons
                    name={glyph}
                    size={size}
                    color={color}
                    style={style}
                    accessibilityElementsHidden={!accessibilityLabel}
                    importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
                    accessibilityLabel={accessibilityLabel}
                />
            );
    }
}

/** Memoized — icons re-render extremely often (every tab focus change,
 *  every list row) and take only primitive props, so this avoids needless
 *  re-renders when a parent list re-renders for unrelated reasons. */
export const Icon = memo(IconBase);