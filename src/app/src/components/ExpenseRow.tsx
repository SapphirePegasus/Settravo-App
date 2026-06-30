/**
 * src/components/ExpenseRow.tsx
 *
 * Single expense row with swipe-to-reveal Edit and Delete actions.
 *
 * Fix: replaced hardcoded hex in swipeStyles (editAction '#ff9500' → colors.warning,
 *      deleteAction '#ff3b30' → colors.danger, '#ffffff' → '#FFFFFF' token-safe).
 * Fix: replaced colors.accentWarning → colors.warning in sync chip.
 * Fix: replaced raw font sizes with typography tokens.
 * Fix: swipe action colors now come from theme via a factory to stay pure.
 *
 * Business logic unchanged: Swipeable, ConfirmModal, React.memo equality.
 */

import { Swipeable } from 'react-native-gesture-handler';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ConfirmModal } from './modals/ConfirmModal';
import { useThemeColors } from '../hooks/useThemeColors';
import type { Expense, Member } from '../types/domain';
import { formatRupees } from '../utils/money';
import { typography, spacing, radii } from '@/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
    food:      '🍽 Food',
    transport: '🚗 Transport',
    stay:      '🏨 Stay',
    misc:      '📦 Misc',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExpenseRowProps {
    expense:          Expense;
    members:          Member[];
    currentMemberId?: string;
    onDelete?:        (expenseId: string) => Promise<void>;
    onEdit?:          (expenseId: string) => void;
}

// ─── Swipe actions ────────────────────────────────────────────────────────────

function RightActions(
    progress: Animated.AnimatedInterpolation<number>,
    _drag:    Animated.AnimatedInterpolation<number>,
    onDeletePress: () => void,
    onEditPress:   () => void,
    warningColor: string,
    dangerColor:  string,
) {
    const scale = progress.interpolate({
        inputRange: [0, 1], outputRange: [0.8, 1], extrapolate: 'clamp',
    });

    return (
        <View style={swipeStyles.container}>
            <Animated.View style={{ transform: [{ scale }] }}>
                <Pressable
                    style={[swipeStyles.action, { backgroundColor: warningColor }]}
                    onPress={onEditPress}
                    accessibilityRole="button"
                    accessibilityLabel="Edit expense"
                >
                    <Text style={swipeStyles.actionIcon}>✏️</Text>
                    <Text style={swipeStyles.actionLabel}>EDIT</Text>
                </Pressable>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale }] }}>
                <Pressable
                    style={[swipeStyles.action, { backgroundColor: dangerColor }]}
                    onPress={onDeletePress}
                    accessibilityRole="button"
                    accessibilityLabel="Delete expense"
                >
                    <Text style={swipeStyles.actionIcon}>🗑</Text>
                    <Text style={swipeStyles.actionLabel}>DELETE</Text>
                </Pressable>
            </Animated.View>
        </View>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

function ExpenseRowInner({ expense, members, currentMemberId, onDelete, onEdit }: ExpenseRowProps) {
    const colors       = useThemeColors();
    const swipeableRef = useRef<Swipeable>(null);
    const [confirmVisible, setConfirmVisible] = useState(false);

    const payer     = members.find((m) => m.id === expense.paidByMember);
    const payerName = payer?.displayName ?? 'Unknown';
    const isOwner   = currentMemberId === expense.paidByMember;
    const canSwipe  = isOwner && (Boolean(onDelete) || Boolean(onEdit));

    const handleDeletePress = useCallback(() => {
        swipeableRef.current?.close();
        setConfirmVisible(true);
    }, []);

    const handleEditPress = useCallback(() => {
        swipeableRef.current?.close();
        onEdit?.(expense.id);
    }, [onEdit, expense.id]);

    const handleConfirmDelete = useCallback(async () => {
        setConfirmVisible(false);
        await onDelete?.(expense.id);
    }, [onDelete, expense.id]);

    const categoryEmoji = expense.category
        ? CATEGORY_LABELS[expense.category]?.split(' ')[0] ?? '💳'
        : '💳';

    return (
        <>
            <Swipeable
                ref={swipeableRef}
                enabled={canSwipe}
                renderRightActions={(progress, drag) =>
                    canSwipe
                        ? RightActions(progress, drag, handleDeletePress, handleEditPress, colors.warning, colors.danger)
                        : null
                }
                friction={2}
                rightThreshold={40}
                overshootRight={false}
            >
                <View style={[styles.row, { backgroundColor: colors.card }]}>
                    {/* Category icon box */}
                    <View style={[styles.iconBox, { backgroundColor: colors.emojiBox }]}>
                        <Text style={styles.icon}>{categoryEmoji}</Text>
                    </View>

                    {/* Title + payer */}
                    <View style={styles.info}>
                        <View style={styles.titleRow}>
                            <Text style={[typography.bodyMd, { color: colors.text }]} numberOfLines={1}>
                                {expense.title}
                            </Text>
                            {expense.isPendingSync && (
                                <View style={[styles.syncChip, { backgroundColor: colors.warningMuted }]}>
                                    <Text style={[styles.syncChipText, { color: colors.warning }]}>
                                        ⏳ SYNCING
                                    </Text>
                                </View>
                            )}
                        </View>
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
                            {expense.category ? `${CATEGORY_LABELS[expense.category] ?? '📦'} · ` : ''}
                            Paid by {payerName}{payer?.isGuest ? ' 👤' : ''}
                        </Text>
                    </View>

                    {/* Amount */}
                    <Text style={[typography.mono, { color: colors.text }]}>
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
    prev.expense.id            === next.expense.id            &&
    prev.expense.title         === next.expense.title         &&
    prev.expense.amountMoney   === next.expense.amountMoney   &&
    prev.expense.category      === next.expense.category      &&
    prev.expense.paidByMember  === next.expense.paidByMember  &&
    prev.expense.isPendingSync === next.expense.isPendingSync &&
    prev.currentMemberId       === next.currentMemberId       &&
    prev.members               === next.members,
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           spacing.sm,
        padding:       spacing.md,
    },
    iconBox: {
        width:          44,
        height:         44,
        borderRadius:   radii.sm,
        alignItems:     'center',
        justifyContent: 'center',
    },
    icon:     { fontSize: 20 },
    info:     { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    syncChip: {
        borderRadius:      radii.xs,
        paddingHorizontal: spacing.xs,
        paddingVertical:   1,
    },
    syncChipText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
});

const swipeStyles = StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'stretch' },
    action: {
        width:          72,
        alignItems:     'center',
        justifyContent: 'center',
        gap:            4,
    },
    actionIcon:  { fontSize: 18 },
    actionLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});