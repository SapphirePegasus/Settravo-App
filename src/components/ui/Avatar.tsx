/**
 * src/components/ui/Avatar.tsx
 *
 * Circular avatar showing initials with a deterministic color-coded background.
 * Replaces src/components/MemberAvatar.tsx (kept for compat during migration).
 *
 * Sizes: sm=28, md=36, lg=44, xl=64, or any number.
 * Color: use avatarColor prop if known; otherwise derived from name hash.
 * Image: optional imageUri for photo avatars (future use).
 *
 * No isDark prop — reads theme internally.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

// ─── Avatar palette ───────────────────────────────────────────────────────────
// Perceptually distinct, accessible on both light and dark backgrounds.

const AVATAR_PALETTE = [
    '#16A34A', '#2563EB', '#7C3AED', '#D97706',
    '#DC2626', '#0891B2', '#9333EA', '#059669',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | number;

interface AvatarProps {
    name: string;
    avatarColor?: string | null;
    size?: AvatarSize;
    imageUri?: string | null;
    accessibilityLabel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIZE_MAP: Record<string, number> = { sm: 28, md: 36, lg: 44, xl: 64 };

function resolveDiameter(size: AvatarSize): number {
    return typeof size === 'number' ? size : SIZE_MAP[size] ?? 36;
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return (parts[0]?.[0] ?? '?').toUpperCase();
}

function hashColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

function AvatarInner({ name, avatarColor, size = 'md', imageUri, accessibilityLabel }: AvatarProps) {
    const diameter = resolveDiameter(size);
    const bg = avatarColor ?? hashColor(name);
    const initials = getInitials(name);
    const fontSize = Math.round(diameter * 0.38);
    const radius = diameter / 2;

    return (
        <View
            style={[
                styles.circle,
                { width: diameter, height: diameter, borderRadius: radius, backgroundColor: bg },
            ]}
            accessibilityLabel={accessibilityLabel ?? `Avatar for ${name}`}
            accessibilityRole="image"
        >
            {imageUri ? (
                <Image
                    source={{ uri: imageUri }}
                    style={[styles.image, { width: diameter, height: diameter, borderRadius: radius }]}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                />
            ) : (
                <Text style={[styles.initials, { fontSize, lineHeight: diameter }]}>
                    {initials}
                </Text>
            )}
        </View>
    );
}

export const Avatar = React.memo(AvatarInner);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    circle: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    image: {
        position: 'absolute',
    },
    initials: {
        color: '#FFFFFF',
        fontWeight: '700',
        textAlign: 'center',
        includeFontPadding: false,
    },
});