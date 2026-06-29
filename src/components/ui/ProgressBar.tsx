/**
 * src/components/ui/ProgressBar.tsx
 *
 * Horizontal fill bar. Used in:
 *   - Add expense: split allocation progress (turns red if over 100%)
 *   - Statistics: per-group spend as % of total
 *
 * value: 0.0–1.0 (clamped). Values >1.0 show overflow in danger color.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { radii } from '@/theme';

interface ProgressBarProps {
    /** 0.0 to 1.0. Values >1 trigger danger color. */
    value: number;
    /** Override fill color. Defaults to colors.accent (or danger if overflow). */
    color?: string;
    height?: number;
    style?: StyleProp<ViewStyle>;
}

function ProgressBarInner({ value, color, height = 6, style }: ProgressBarProps) {
    const colors = useThemeColors();
    const clamped = Math.min(Math.max(value, 0), 1);
    const overflow = value > 1;
    const fillColor = color ?? (overflow ? colors.danger : colors.accent);

    return (
        <View
            style={[
                styles.track,
                { height, backgroundColor: colors.separator, borderRadius: height / 2 },
                style,
            ]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
        >
            <View
                style={[
                    styles.fill,
                    {
                        width: `${clamped * 100}%`,
                        height,
                        backgroundColor: fillColor,
                        borderRadius: height / 2,
                    },
                ]}
            />
        </View>
    );
}

export const ProgressBar = React.memo(ProgressBarInner);

const styles = StyleSheet.create({
    track: {
        overflow: 'hidden',
    },
    fill: {
        position: 'absolute',
        left: 0,
        top: 0,
    },
});