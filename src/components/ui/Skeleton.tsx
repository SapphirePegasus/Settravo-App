/**
 * src/components/ui/Skeleton.tsx
 *
 * Pulsing placeholder for content loading states.
 *
 * Usage:
 *   <Skeleton width={120} height={16} />          — inline rect
 *   <SkeletonTripCard />                           — full TripCard placeholder
 *
 * Animation: opacity pulses between 0.25 and 0.85 using Reanimated's
 * withRepeat + withSequence + withTiming. No gradient shimmer (avoids
 * the react-native-linear-gradient dependency while still being visually
 * clear to users that content is loading).
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';

import { useThemeColors } from '@/hooks/useThemeColors';
import { spacing, radii } from '@/theme';

// ─── Base rect ────────────────────────────────────────────────────────────────

interface SkeletonProps {
    width?: number | `${number}%`;
    height?: number;
    borderRadius?: number;
    style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 14, borderRadius = radii.sm, style }: SkeletonProps) {
    const colors = useThemeColors();
    const opacity = useSharedValue(0.25);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(0.85, { duration: 650, easing: Easing.out(Easing.ease) }),
                withTiming(0.25, { duration: 650, easing: Easing.in(Easing.ease) }),
            ),
            -1,
            false,
        );
        // Cleanup: Reanimated cancels shared-value animations automatically on
        // component unmount; no explicit cancel needed here.
    }, [opacity]);

    const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View
            style={[
                { width, height, borderRadius, backgroundColor: colors.separator },
                animStyle,
                style,
            ]}
        />
    );
}

// ─── Trip card placeholder ────────────────────────────────────────────────────

export function SkeletonTripCard() {
    return (
        <View style={skStyles.card}>
            <Skeleton width={56} height={56} borderRadius={radii.md} />
            <View style={skStyles.info}>
                <Skeleton width="65%" height={15} />
                <Skeleton width="45%" height={12} style={{ marginTop: 6 }} />
                <Skeleton width="30%" height={11} style={{ marginTop: 6 }} />
            </View>
        </View>
    );
}

// ─── Expense row placeholder ───────────────────────────────────────────────────

export function SkeletonExpenseRow() {
    return (
        <View style={skStyles.expenseRow}>
            <Skeleton width={44} height={44} borderRadius={radii.sm} />
            <View style={skStyles.expenseInfo}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="40%" height={12} style={{ marginTop: 5 }} />
            </View>
            <Skeleton width={52} height={14} />
        </View>
    );
}

const skStyles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        gap: spacing.md,
        borderRadius: radii.lg,
        overflow: 'hidden',
    },
    info: { flex: 1, gap: 0 },
    expenseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        gap: spacing.sm,
    },
    expenseInfo: { flex: 1 },
});