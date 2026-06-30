/**
 * src/components/trip/TripSummaryCard.tsx
 *
 * Shows total spend and settlement snapshot for a trip.
 * 🎉 emoji replaced with <Icon name="status.celebration" />.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Expense, Settlement } from '../../types/domain';
import { formatRupees } from '../../utils/money';
import { typography, spacing, radii } from '@/theme';

interface Props {
    expenses: Expense[];
    settlements: Settlement[];
    allSettled: boolean;
    onSettlePress: () => void;
}

export function TripSummaryCard({ expenses, settlements, allSettled, onSettlePress }: Props) {
    const colors = useThemeColors();
    const totalPaise = expenses.reduce((s, e) => s + e.amountMoney, 0);
    const preview = settlements.slice(0, 2);

    if (expenses.length === 0) return null;

    return (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {/* Total spent row */}
            <View style={styles.totalRow}>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    TOTAL SPENT
                </Text>
                <Text style={[typography.monoLg, { color: colors.text }]}>
                    {formatRupees(totalPaise)}
                </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.separator }]} />

            {/* Settlement state */}
            {allSettled ? (
                <View style={styles.allSettledRow}>
                    <Icon name="status.celebration" size={20} color={colors.success} />
                    <Text style={[typography.bodyMd, { color: colors.success }]}>
                        All Settled!
                    </Text>
                </View>
            ) : preview.length > 0 ? (
                <>
                    <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                        SETTLEMENTS
                    </Text>
                    {preview.map((s, i) => (
                        <Text key={i} style={[typography.body, { color: colors.textSecondary, marginBottom: 4 }]}>
                            {s.fromMemberName} → {s.toMemberName}
                            {'  '}
                            <Text style={[typography.bodyMd, { color: colors.text }]}>
                                {formatRupees(s.amountMoney)}
                            </Text>
                        </Text>
                    ))}
                    <Pressable onPress={onSettlePress} hitSlop={8} style={styles.settleLink}>
                        <Text style={[typography.bodyMd, { color: colors.accent }]}>
                            {settlements.length > 2
                                ? `+${settlements.length - 2} more · Settle Up →`
                                : 'Settle Up →'}
                        </Text>
                    </Pressable>
                </>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.md,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginBottom: spacing.md,
    },
    allSettledRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
    },
    settleLink: { marginTop: spacing.sm },
});