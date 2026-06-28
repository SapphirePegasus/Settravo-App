/**
 * ExpenseDateSection.tsx
 *
 * Date section header for the grouped expense list.
 * Renders "Today", "Yesterday", or "15 Jan" above each date group.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Props {
    dateKey: string; // ISO date string "2025-01-15"
}

function formatSectionDate(dateKey: string): string {
    const date = new Date(dateKey);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    if (sameDay(date, today)) return 'Today';
    if (sameDay(date, yesterday)) return 'Yesterday';

    return date.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year:
            date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
}

export function ExpenseDateSection({ dateKey }: Props) {
    const colors = useThemeColors();
    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: colors.subText }]}>
                {formatSectionDate(dateKey)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { paddingVertical: 6, paddingHorizontal: 2 },
    label: { fontSize: 13, fontWeight: '600' },
});