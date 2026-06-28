/**
 * TripSummaryCard.tsx
 *
 * Extracted from [tripId]/index.tsx (task 4.12).
 * Shows total spend and settlement snapshot for a trip.
 * Tapping "Full settle plan →" navigates to the settle screen.
 */

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Expense, Member, Settlement, Split } from '../../types/domain';
import { formatRupees } from '../../utils/money';

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
        <View style={[styles.card, { backgroundColor: colors.card }]}>
            {/* Total */}
            <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.subText }]}>Total spent</Text>
                <Text style={[styles.totalAmount, { color: colors.text }]}>
                    {formatRupees(totalPaise)}
                </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.separator }]} />

            {/* Settlement state */}
            {allSettled ? (
                <Text style={[styles.allSettled, { color: colors.accentSuccess }]}>
                    All Settled! 🎉
                </Text>
            ) : settlements.length === 0 ? null : (
                <>
                    <Text style={[styles.sectionLabel, { color: colors.subText }]}>
                        Settlements
                    </Text>
                    {preview.map((s, i) => (
                        <Text key={i} style={[styles.settlementLine, { color: colors.textSecondary }]}>
                            {s.fromMemberName} → {s.toMemberName}
                            {'  '}
                            <Text style={{ fontWeight: '600', color: colors.text }}>
                                {formatRupees(s.amountMoney)}
                            </Text>
                        </Text>
                    ))}
                    <Pressable onPress={onSettlePress} hitSlop={8}>
                        <Text style={[styles.seeAll, { color: colors.accent }]}>
                            {settlements.length > 2
                                ? `See all ${settlements.length} →`
                                : 'Full settle plan →'}
                        </Text>
                    </Pressable>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: 16, padding: 16 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { fontSize: 13, fontWeight: '500' },
    totalAmount: { fontSize: 28, fontWeight: '700' },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
    allSettled: { fontSize: 18, fontWeight: '700', textAlign: 'center', paddingVertical: 4 },
    sectionLabel: { fontSize: 13, fontWeight: '500', color: '#8e8e93', marginBottom: 6 },
    settlementLine: { fontSize: 14, marginBottom: 4, lineHeight: 20 },
    seeAll: { fontSize: 14, fontWeight: '500', marginTop: 8 },
});