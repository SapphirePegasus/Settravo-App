/**
 * src/components/MemberAvatar.tsx
 *
 * Circular member avatar showing initials with a color-coded background.
 *
 * REFACTOR (Phase B):
 *  - Removed isDark prop — component now reads theme internally via useThemeColors().
 *  - All call sites that pass isDark={isDark} can simply remove that prop.
 *  - avatarColor prop: if provided, uses it as background; otherwise derives from name hash.
 *  - Size: numeric px value or predefined: 'sm'=28, 'md'=36, 'lg'=44, 'xl'=64.
 *
 * This component will be superseded by src/components/ui/Avatar.tsx in Phase C,
 * but MemberAvatar is kept here so existing screens don't break in the interim.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';

// ─── Types ────────────────────────────────────────────────────────────────────

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | number;

interface MemberAvatarProps {
    name: string;
    /** Hex color string for the avatar background. Falls back to hash-derived color. */
    avatarColor?: string | null;
    size?: AvatarSize;
    /** @deprecated No longer needed — component reads theme internally. Remove from call sites. */
    isDark?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE_MAP: Record<string, number> = {
    sm: 28,
    md: 36,
    lg: 44,
    xl: 64,
};

// Accessible, perceptually-distinct avatar palette (works on both light and dark)
const AVATAR_COLORS = [
    '#16A34A', // green
    '#2563EB', // blue
    '#7C3AED', // violet
    '#D97706', // amber
    '#DC2626', // red
    '#0891B2', // cyan
    '#9333EA', // purple
    '#059669', // emerald
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return (parts[0]?.[0] ?? '?').toUpperCase();
}

function hashColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

function MemberAvatarInner({ name, avatarColor, size = 'md' }: MemberAvatarProps) {
    // isDark prop is accepted but ignored — kept only for backward compatibility
    // so callers don't need to be updated before Phase C migration.
    useThemeColors(); // ensure we're in a ThemeProvider context

    const diameter = typeof size === 'number' ? size : SIZE_MAP[size] ?? 36;
    const bgColor = avatarColor ?? hashColor(name);
    const initials = getInitials(name);
    const fontSize = Math.round(diameter * 0.38);

    return (
        <View
            style={[
                styles.circle,
                {
                    width: diameter,
                    height: diameter,
                    borderRadius: diameter / 2,
                    backgroundColor: bgColor,
                },
            ]}
            accessibilityLabel={`Avatar for ${name}`}
        >
            <Text style={[styles.initials, { fontSize, lineHeight: diameter }]}>
                {initials}
            </Text>
        </View>
    );
}

export const MemberAvatar = React.memo(MemberAvatarInner);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    circle: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    initials: {
        color: '#FFFFFF',
        fontWeight: '700',
        textAlign: 'center',
        includeFontPadding: false,
    },
});