/**
 * src/components/ui/Divider.tsx
 *
 * 1px separator. Horizontal (default) or vertical.
 * Color always colors.separator — never hardcoded.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { spacing } from '@/theme';

interface DividerProps {
    vertical?: boolean;
    inset?: boolean;  // adds left margin for list separators
    style?: StyleProp<ViewStyle>;
}

function DividerInner({ vertical = false, inset = false, style }: DividerProps) {
    const colors = useThemeColors();

    return (
        <View
            style={[
                vertical ? styles.vertical : styles.horizontal,
                { backgroundColor: colors.separator },
                inset && styles.inset,
                style,
            ]}
            accessibilityRole="none"
            importantForAccessibility="no"
        />
    );
}

export const Divider = React.memo(DividerInner);

const styles = StyleSheet.create({
    horizontal: {
        height: StyleSheet.hairlineWidth,
        alignSelf: 'stretch',
    },
    vertical: {
        width: StyleSheet.hairlineWidth,
        alignSelf: 'stretch',
    },
    inset: {
        marginLeft: spacing.lg,
    },
});