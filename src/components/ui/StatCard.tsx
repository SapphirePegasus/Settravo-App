/**
 * src/components/ui/StatCard.tsx
 *
 * Single statistic display: label above, amount below.
 * Used in 3-column rows on Dashboard and Group Detail.
 *
 * colorRole: maps to semantic token families.
 *   'owed'    — green (money owed to you)
 *   'owe'     — red   (money you owe)
 *   'neutral' — primary text (total spent, etc.)
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography, spacing, radii } from '@/theme';
import { formatRupees } from '@/utils/money';

export type StatColorRole = 'owed' | 'owe' | 'neutral';

interface StatCardProps {
    label: string;
    paise: number;
    colorRole?: StatColorRole;
}

function StatCardInner({ label, paise, colorRole = 'neutral' }: StatCardProps) {
    const colors = useThemeColors();

    const amountColor = {
        owed: colors.owed,
        owe: colors.owe,
        neutral: colors.text,
    }[colorRole];

    return (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text
                style={[typography.label, { color: colors.textSecondary }]} 
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
            >
                {label.toUpperCase()}
            </Text>
            <Text style={[typography.monoLg, { color: amountColor, marginTop: spacing.xs }]} numberOfLines={1}>
                {formatRupees(Math.abs(paise))}
            </Text>
        </View>
    );
}

export const StatCard = React.memo(StatCardInner);

const styles = StyleSheet.create({
    card: {
        flex: 1,
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'flex-start',
    },
});