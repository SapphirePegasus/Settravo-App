/**
 * ExpenseRow.tsx
 *
 * Single expense row for the trip detail expense list.
 * Shows title, category badge, paid-by name, amount, and pending sync indicator.
 * Supports both device members and guest members (device_id = null).
 * Long-press to delete (owner only).
 */

import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Expense, Member } from '../types/domain';
import { formatRupees } from '../utils/money';

interface Props {
    expense: Expense;
    members: Member[];
    isDark: boolean;
    onDelete?: (expenseId: string) => void;
    currentMemberId?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    food: '🍽',
    transport: '🚗',
    stay: '🏨',
    misc: '📦',
};

export function ExpenseRow({ expense, members, isDark, onDelete, currentMemberId }: Props) {
    const colors = isDark ? dark : light;

    // Works for both device members and guest members since both have an `id` field
    const payer = members.find((m) => m.id === expense.paidByMember);
    const payerName = payer?.displayName ?? '—';

    const isOwner = currentMemberId === expense.paidByMember;

    function handleLongPress() {
        if (!isOwner || !onDelete) return;
        Alert.alert(
            'Delete Expense',
            `Delete "${expense.title}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => onDelete(expense.id),
                },
            ],
        );
    }

    return (
        <Pressable
            style={[styles.row, { backgroundColor: colors.card }]}
            onLongPress={handleLongPress}
        >
            {/* Category icon */}
            <View style={[styles.iconBox, { backgroundColor: colors.iconBg }]}>
                <Text style={styles.icon}>
                    {expense.category ? (CATEGORY_LABELS[expense.category] ?? '📦') : '💳'}
                </Text>
            </View>

            {/* Title + payer */}
            <View style={styles.info}>
                <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                        {expense.title}
                    </Text>
                    {expense.isPendingSync && (
                        <View style={[styles.pendingDot, { backgroundColor: colors.pending }]} />
                    )}
                </View>
                <Text style={[styles.payer, { color: colors.subText }]}>
                    Paid by {payerName}
                    {payer?.isGuest ? ' 👤' : ''}
                </Text>
            </View>

            {/* Amount */}
            <Text style={[styles.amount, { color: colors.text }]}>
                {formatRupees(expense.amountMoney)}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: { fontSize: 20 },
    info: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { fontSize: 16, fontWeight: '500', flex: 1 },
    pendingDot: { width: 8, height: 8, borderRadius: 4 },
    payer: { fontSize: 13, marginTop: 2 },
    amount: { fontSize: 16, fontWeight: '600' },
});

const light = {
    card: '#ffffff',
    text: '#000000',
    subText: '#6c6c70',
    iconBg: '#f2f2f7',
    pending: '#ff9500',
};
const dark = {
    card: '#1c1c1e',
    text: '#ffffff',
    subText: '#8e8e93',
    iconBg: '#2c2c2e',
    pending: '#ff9f0a',
};