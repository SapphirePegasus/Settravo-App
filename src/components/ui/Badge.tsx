/**
 * src/components/ui/Badge.tsx
 *
 * Small status pill. Used for settled/pending/warning states.
 *
 * Variants:
 *   success   — green (owed, positive)
 *   danger    — red (owe, destructive)
 *   warning   — amber (offline, expiring)
 *   neutral   — muted grey (info)
 *   settled   — extra-muted (completed state)
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography, radii, spacing } from '@/theme';

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'neutral' | 'settled';

interface BadgeProps {
    label: string;
    variant?: BadgeVariant;
}

function BadgeInner({ label, variant = 'neutral' }: BadgeProps) {
    const colors = useThemeColors();

    const bg = {
        success: colors.successMuted,
        danger: colors.dangerMuted,
        warning: colors.warningMuted,
        neutral: colors.subSurface,
        settled: colors.subSurface,
    }[variant];

    const textColor = {
        success: colors.success,
        danger: colors.danger,
        warning: colors.warning,
        neutral: colors.textSecondary,
        settled: colors.settled,
    }[variant];

    return (
        <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[typography.label, { color: textColor }]} numberOfLines={1}>
                {label.toUpperCase()}
            </Text>
        </View>
    );
}

export const Badge = React.memo(BadgeInner);

const styles = StyleSheet.create({
    badge: {
        borderRadius: radii.full,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        alignSelf: 'flex-start',
    },
});