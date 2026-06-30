/**
 * src/components/ui/Card.tsx
 *
 * Surface container. The building block for all card-style UI.
 * Handles: background, border radius, optional shadow, optional press state.
 *
 * Props:
 *   padded  — adds standard internal padding (default true)
 *   onPress — makes card pressable with opacity feedback
 *   shadow  — 'none' | 'low' | 'mid' (default 'low')
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { radii, shadows, spacing } from '@/theme';

type ShadowLevel = 'none' | 'low' | 'mid';

interface CardProps {
    children: React.ReactNode;
    padded?: boolean;
    shadow?: ShadowLevel;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
}

function CardInner({
    children,
    padded = true,
    shadow = 'low',
    onPress,
    style,
    accessibilityLabel,
}: CardProps) {
    const colors = useThemeColors();

    const shadowStyle = {
        none: {},
        low: shadows.low,
        mid: shadows.mid,
    }[shadow];

    const containerStyle = [
        styles.base,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
        shadowStyle,
        padded && styles.padded,
        style,
    ] as StyleProp<ViewStyle>;

    if (onPress) {
        return (
            <Pressable
                style={({ pressed }) => [
                    containerStyle,
                    pressed && styles.pressed,
                ]}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
            >
                {children}
            </Pressable>
        );
    }

    return (
        <View style={containerStyle}>
            {children}
        </View>
    );
}

export const Card = React.memo(CardInner);

const styles = StyleSheet.create({
    base: {
        borderRadius: radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    padded: {
        padding: spacing.md,
    },
    pressed: {
        opacity: 0.88,
    },
});