/**
 * src/components/ui/AmountText.tsx
 *
 * Monetary amount display with automatic color based on sign.
 * Always uses tabular numerals for stable column alignment.
 *
 * sign prop:
 *   'auto'     — positive=owed (green), negative=owe (red), zero=muted
 *   'positive' — always owed color
 *   'negative' — always owe color
 *   'neutral'  — always primary text color
 *
 * size:
 *   'sm' — caption font
 *   'md' — mono font (default)
 *   'lg' — monoLg font (for cards and heroes)
 */

import React from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography } from '@/theme';
import { formatRupees } from '@/utils/money';

export type AmountSign = 'auto' | 'positive' | 'negative' | 'neutral';
export type AmountSize = 'sm' | 'md' | 'lg';

interface AmountTextProps {
    /** Amount in paise (integer) */
    paise: number;
    sign?: AmountSign;
    size?: AmountSize;
    style?: StyleProp<TextStyle>;
}

const SIZE_STYLE = {
    sm: typography.caption,
    md: typography.mono,
    lg: typography.monoLg,
} as const;

function AmountTextInner({ paise, sign = 'auto', size = 'md', style }: AmountTextProps) {
    const colors = useThemeColors();

    const textColor = (() => {
        if (sign === 'positive') return colors.owed;
        if (sign === 'negative') return colors.owe;
        if (sign === 'neutral') return colors.text;
        // auto
        if (paise > 0) return colors.owed;
        if (paise < 0) return colors.owe;
        return colors.textSecondary;
    })();

    const prefix = (sign === 'auto' && paise > 0) ? '+' : '';
    const display = `${prefix}${formatRupees(Math.abs(paise))}`;

    return (
        <Text
            style={[SIZE_STYLE[size], { color: textColor }, style]}
            numberOfLines={1}
            accessibilityLabel={`${paise >= 0 ? 'Owed' : 'Owe'} ${display}`}
        >
            {display}
        </Text>
    );
}

export const AmountText = React.memo(AmountTextInner);