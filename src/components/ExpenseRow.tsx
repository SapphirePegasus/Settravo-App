/**
 * ExpenseRow.tsx
 *
 * Single expense row with swipe-to-reveal Edit and Delete actions.
 *
 * Architecture:
 *  - Swipeable from react-native-gesture-handler (already installed, zero new deps)
 *  - Swipe LEFT → reveals Edit (amber) + Delete (red) actions (owner only)
 *  - Delete triggers ConfirmModal bottom sheet — not Alert.alert
 *  - Edit navigates to edit-expense screen via onEdit callback
 *  - Wrapped in React.memo with a custom equality check — only re-renders
 *    when the expense content, payer name, or pending state changes
 *
 * Ownership rule: only the paidByMember can edit/delete.
 * Guest members are supported (device_id = null).
 */

import { Swipeable } from 'react-native-gesture-handler';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ConfirmModal } from './modals/ConfirmModal';
import { useThemeColors } from '../hooks/useThemeColors';
import type { Expense, Member } from '../types/domain';
import { formatRupees } from '../utils/money';

interface Props {
    expense: Expense;
    members: Member[];
    currentMemberId?: string;
    onDelete?: (expenseId: string) => Promise<void>;
    onEdit?: (expenseId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
    food: '🍽 Food',
    transport: '🚗 Transport',
    stay: '🏨 Stay',
    misc: '📦 Misc',
};

// ─── Swipe action renderers ───────────────────────────────────────────────────

function RightActions(
    progress: Animated.AnimatedInterpolation<number>,
    _drag: Animated.AnimatedInterpolation<number>,
    onDeletePress: () => void,
    onEditPress: () => void,
) {
    const scale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.8, 1],
        extrapolate: 'clamp',
    });

    return (
        <View style={swipeStyles.container}>
            <Animated.View style={{ transform: [{ scale }] }}>
                <Pressable
                    style={[swipeStyles.action, swipeStyles.editAction]}
                    onPress={onEditPress}
                    accessibilityLabel="Edit expense"
                    accessibilityRole="button"
                >
                    <Text style={swipeStyles.actionIcon}>✏️</Text>
                    <Text style={swipeStyles.actionLabel}>Edit</Text>
                </Pressable>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale }] }}>
                <Pressable
                    style={[swipeStyles.action, swipeStyles.deleteAction]}
                    onPress={onDeletePress}
                    accessibilityLabel="Delete expense"
                    accessibilityRole="button"
                >
                    <Text style={swipeStyles.actionIcon}>🗑</Text>
                    <Text style={swipeStyles.actionLabel}>Delete</Text>
                </Pressable>
            </Animated.View>
        </View>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

function ExpenseRowInner({ expense, members, currentMemberId, onDelete, onEdit }: Props) {
    const colors = useThemeColors();
    const swipeableRef = useRef<Swipeable>(null);
    const [confirmVisible, setConfirmVisible] = useState(false);

    const payer = members.find((m) => m.id === expense.paidByMember);
    const payerName = payer?.displayName ?? '—';
    const isOwner = currentMemberId === expense.paidByMember;

    const handleDeletePress = useCallback(() => {
        // Close swipeable then show modal so the row snaps shut cleanly
        swipeableRef.current?.close();
        setConfirmVisible(true);
    }, []);

    const handleEditPress = useCallback(() => {
        swipeableRef.current?.close();
        onEdit?.(expense.id);
    }, [expense.id, onEdit]);

    const handleConfirmDelete = useCallback(async () => {
        setConfirmVisible(false);
        await onDelete?.(expense.id);
    }, [expense.id, onDelete]);

    const renderRightActions = useCallback(
        (progress: Animated.AnimatedInterpolation<number>, drag: Animated.AnimatedInterpolation<number>) =>
            isOwner
                ? RightActions(progress, drag, handleDeletePress, handleEditPress)
                : null,
        [isOwner, handleDeletePress, handleEditPress],
    );

    return (
        <>
            <Swipeable
                ref={swipeableRef}
                friction={2}
                overshootRight={false}
                rightThreshold={40}
                renderRightActions={renderRightActions}
                containerStyle={styles.swipeContainer}
            >
                <View style={[styles.row, { backgroundColor: colors.card }]}>
                    {/* Category icon box */}
                    <View style={[styles.iconBox, { backgroundColor: colors.cardElevated }]}>
                        <Text style={styles.icon}>
                            {expense.category
                                ? CATEGORY_LABELS[expense.category]?.split(' ')[0] ?? '💳'
                                : '💳'}
                        </Text>
                    </View>

                    {/* Title + payer + category label */}
                    <View style={styles.info}>
                        <View style={styles.titleRow}>
                            <Text
                                style={[styles.title, { color: colors.text }]}
                                numberOfLines={1}
                            >
                                {expense.title}
                            </Text>
                            {expense.isPendingSync && (
                                <View
                                    style={[
                                        styles.syncChip,
                                        { backgroundColor: colors.accentWarning + '26' },
                                    ]}
                                >
                                    <Text style={[styles.syncChipText, { color: colors.accentWarning }]}>
                                        ⏳ Syncing
                                    </Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.payer, { color: colors.subText }]} numberOfLines={1}>
                            {expense.category
                                ? `${CATEGORY_LABELS[expense.category] ?? '📦'} · `
                                : ''}
                            Paid by {payerName}
                            {payer?.isGuest ? ' 👤' : ''}
                        </Text>
                    </View>

                    {/* Amount */}
                    <Text style={[styles.amount, { color: colors.text }]}>
                        {formatRupees(expense.amountMoney)}
                    </Text>
                </View>
            </Swipeable>

            <ConfirmModal
                visible={confirmVisible}
                title={`Delete "${expense.title}"?`}
                message="This expense and its splits will be permanently removed. This cannot be undone."
                confirmLabel="Delete"
                confirmVariant="destructive"
                onConfirm={handleConfirmDelete}
                onCancel={() => setConfirmVisible(false)}
            />
        </>
    );
}

export const ExpenseRow = React.memo(ExpenseRowInner, (prev, next) =>
    prev.expense.id === next.expense.id &&
    prev.expense.title === next.expense.title &&
    prev.expense.amountMoney === next.expense.amountMoney &&
    prev.expense.category === next.expense.category &&
    prev.expense.paidByMember === next.expense.paidByMember &&
    prev.expense.isPendingSync === next.expense.isPendingSync &&
    prev.currentMemberId === next.currentMemberId &&
    prev.members === next.members,
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    swipeContainer: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: { fontSize: 20 },
    info: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    title: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
    syncChip: {
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 1,
    },
    syncChipText: { fontSize: 10, fontWeight: '600' },
    payer: { fontSize: 13, marginTop: 2 },
    amount: { fontSize: 16, fontWeight: '600' },
});

const swipeStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    action: {
        width: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    editAction: { backgroundColor: '#ff9500' },
    deleteAction: { backgroundColor: '#ff3b30' },
    actionIcon: { fontSize: 18 },
    actionLabel: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
});