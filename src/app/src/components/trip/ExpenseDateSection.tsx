/**
 * src/components/trip/ExpenseDateSection.tsx
 *
 * Date section header for the grouped expense list.
 * Renders "Today", "Yesterday", or "15 Jan" above each date group.
 *
 * Fix: replaced colors.subText → colors.textSecondary (proper token).
 *      colors.subText is a compat alias but we own this file so use the real name.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import { typography, spacing } from '@/theme';

interface Props {
    dateKey: string; // ISO date string "2025-01-15"
}

function formatSectionDate(dateKey: string): string {
    const date      = new Date(dateKey);
    const today     = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth()    === b.getMonth()    &&
        a.getDate()     === b.getDate();

    if (sameDay(date, today))     return 'Today';
    if (sameDay(date, yesterday)) return 'Yesterday';

    return date.toLocaleDateString('en-IN', {
        day:  'numeric',
        month: 'short',
        year:  date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
}

export function ExpenseDateSection({ dateKey }: Props) {
    const colors = useThemeColors();
    return (
        <View style={styles.container}>
            <Text style={[typography.label, { color: colors.textSecondary }]}>
                {formatSectionDate(dateKey)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical:   spacing.sm,
        paddingHorizontal: spacing.xs,
    },
});