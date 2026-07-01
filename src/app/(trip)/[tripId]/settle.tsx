/**
 * app/(trip)/[tripId]/settle.tsx — Settle Up
 *
 * Design delta fixes applied in this revision:
 *   - "To Settle (N) | Settled (N)" tab pills matching mockup screen 8.
 *   - Settled tab shows historical settlement pairs derived from isSettled splits.
 *   - Confetti burst on all-settled state using Reanimated animated circles.
 */

import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withTiming,
    withSpring,
    Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmModal } from '../../../components/modals/ConfirmModal';
import { Avatar } from '../../../components/ui/Avatar';
import { Icon } from '../../../components/ui/Icon';
import { useToast } from '../../../components/Toast';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useExpenses } from '../../../hooks/useExpenses';
import { useMembers } from '../../../hooks/useMembers';
import { markSettledBetweenMembers } from '../../../services/expenseService';
import { useExpenseStore } from '../../../stores/expenseStore';
import { calculateSettlements } from '../../../utils/settlement';
import { formatRupees } from '../../../utils/money';
import { spacing, typography, radii, shadows } from '@/theme';
import type { Expense, Split, Member } from '../../../types/domain';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabMode = 'pending' | 'settled';

interface PendingAction {
    fromMemberId: string;
    toMemberId: string;
    fromMemberName: string;
    toMemberName: string;
    amount: number;
    expenseIds: string[];
}

interface SettledPair {
    key: string;
    fromMemberId: string;
    toMemberId: string;
    fromMemberName: string;
    toMemberName: string;
    amountMoney: number;
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#22C55E', '#FBBF24', '#3B82F6', '#EC4899', '#8B5CF6', '#F97316'];
const CONFETTI_COUNT = 16;

function ConfettiParticle({ index, startY }: { index: number; startY: number }) {
    const angle = (index / CONFETTI_COUNT) * 2 * Math.PI;
    const distance = 80 + (index % 3) * 40;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance - 60;

    const opacity = useSharedValue(0);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(0);

    useEffect(() => {
        const delay = index * 30;
        opacity.value = withDelay(delay, withTiming(1, { duration: 150 }));
        scale.value = withDelay(delay, withSpring(1, { damping: 8, stiffness: 180 }));
        translateX.value = withDelay(delay, withTiming(tx, { duration: 600, easing: Easing.out(Easing.cubic) }));
        translateY.value = withDelay(delay, withTiming(ty, { duration: 600, easing: Easing.out(Easing.cubic) }));

        // Fade out after burst
        opacity.value = withDelay(delay + 800, withTiming(0, { duration: 400 }));
    }, []);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
    const size = 8 + (index % 3) * 4;

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                },
                style,
            ]}
        />
    );
}

function Confetti({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <View style={confettiStyles.container} pointerEvents="none">
            {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
                <ConfettiParticle key={i} index={i} startY={0} />
            ))}
        </View>
    );
}

const confettiStyles = StyleSheet.create({
    container: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        top: '40%',
        left: 0,
        right: 0,
    },
});

// ─── Settled history calculation ──────────────────────────────────────────────

function calculateSettledHistory(
    expenses: Expense[],
    splits: Split[],
    members: Member[],
): SettledPair[] {
    const memberMap = new Map(members.map((m) => [m.id, m.displayName]));
    const expenseMap = new Map(expenses.map((e) => [e.id, e]));

    // Sum settled amounts grouped by (debtor → creditor) pair
    const pairTotals = new Map<string, number>();
    for (const split of splits) {
        if (!split.isSettled) continue;
        const expense = expenseMap.get(split.expenseId);
        if (!expense) continue;
        // The split.memberId owes expense.paidByMember
        if (split.memberId === expense.paidByMember) continue;
        const key = `${split.memberId}|${expense.paidByMember}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) + split.shareMoney);
    }

    const result: SettledPair[] = [];
    for (const [key, amount] of pairTotals.entries()) {
        const [fromId, toId] = key.split('|');
        result.push({
            key,
            fromMemberId: fromId,
            toMemberId: toId,
            fromMemberName: memberMap.get(fromId) ?? 'Unknown',
            toMemberName: memberMap.get(toId) ?? 'Unknown',
            amountMoney: amount,
        });
    }
    return result;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettleScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const { expenses } = useExpenses(tripId ?? '');
    const members = useMembers(tripId ?? '');
    const allSplits = useExpenseStore((s) => s.splits);
    const setSplitSettled = useExpenseStore((s) => s.setSplitSettled);

    const [tab, setTab] = useState<TabMode>('pending');
    const [loading, setLoading] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);

    const flatSplits = useMemo(() => {
        const result: Split[] = [];
        for (const exp of expenses) {
            for (const sp of allSplits[exp.id] ?? []) {
                result.push(sp);
            }
        }
        return result;
    }, [expenses, allSplits]);

    const pendingSettlements = useMemo(
        () => calculateSettlements(expenses, flatSplits, members),
        [expenses, flatSplits, members],
    );

    const settledHistory = useMemo(
        () => calculateSettledHistory(expenses, flatSplits, members),
        [expenses, flatSplits, members],
    );

    const memberNameMap = useMemo(
        () => new Map(members.map((m) => [m.id, m.displayName])),
        [members],
    );

    const allSettled = expenses.length > 0 && pendingSettlements.length === 0;

    // Trigger confetti once when all settled
    const confettiTriggered = useRef(false);
    useEffect(() => {
        if (allSettled && !confettiTriggered.current) {
            confettiTriggered.current = true;
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 1800);
        }
    }, [allSettled]);

    function findRelevantExpenseIds(fromId: string, toId: string): string[] {
        return expenses
            .filter((e) => e.paidByMember === toId || e.paidByMember === fromId)
            .map((e) => e.id);
    }

    const confirmAction = useCallback(async () => {
        if (!pendingAction || !tripId) return;
        setLoading(true);
        try {
            await markSettledBetweenMembers(tripId, pendingAction.fromMemberId, pendingAction.toMemberId);
            setSplitSettled(pendingAction.expenseIds, pendingAction.fromMemberId, true);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast({ message: 'Marked as paid', variant: 'success' });
        } catch (err) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showToast({
                message: err instanceof Error ? err.message : 'Failed to update settlement',
                variant: 'error',
            });
        } finally {
            setLoading(false);
            setPendingAction(null);
        }
    }, [pendingAction, tripId, setSplitSettled, showToast]);

    const handleMarkPaid = useCallback(
        (fromMemberId: string, toMemberId: string, amount: number) => {
            const fromName = memberNameMap.get(fromMemberId) ?? 'Unknown';
            const toName = memberNameMap.get(toMemberId) ?? 'Unknown';
            const expenseIds = findRelevantExpenseIds(fromMemberId, toMemberId);
            setPendingAction({ fromMemberId, toMemberId, fromMemberName: fromName, toMemberName: toName, amount, expenseIds });
        },
        [memberNameMap, expenses],
    );

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* ── Header ──────────────────────────────────────────────── */}
            <View style={[styles.header, { borderBottomColor: colors.separator }]}>
                <Pressable
                    onPress={() => router.back()}
                    style={styles.headerBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Icon name="header.back" size={24} color={colors.accent} />
                </Pressable>
                <Text style={[typography.bodyMd, { color: colors.text }]}>Settle Up</Text>
                <View style={styles.headerBtn} />
            </View>

            {/* ── Tab pills: To Settle (N) | Settled (N) ──────────────── */}
            <View style={[styles.tabRow, { backgroundColor: colors.surface, borderBottomColor: colors.separator }]}>
                {(['pending', 'settled'] as const).map((mode) => {
                    const count = mode === 'pending' ? pendingSettlements.length : settledHistory.length;
                    const label = mode === 'pending' ? 'To Settle' : 'Settled';
                    const active = tab === mode;
                    return (
                        <Pressable
                            key={mode}
                            style={[
                                styles.tabPill,
                                active && { backgroundColor: colors.accent },
                            ]}
                            onPress={() => setTab(mode)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${label}, ${count} items`}
                        >
                            <Text style={[
                                typography.bodyMd,
                                {
                                    color: active ? colors.textInverse : colors.textSecondary,
                                    fontWeight: '600',
                                },
                            ]}>
                                {label} ({count})
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {loading && (
                    <View style={styles.loadingRow}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                )}

                {/* ── To Settle tab ──────────────────────────────────── */}
                {tab === 'pending' && (
                    allSettled ? (
                        <View style={styles.allSettledContainer}>
                            <Icon name="status.celebration" size={64} color={colors.success} />
                            <Text style={[typography.title, { color: colors.text, textAlign: 'center', marginTop: spacing.md }]}>
                                All settled up!
                            </Text>
                            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                                Everyone's even. Time to plan the next trip!
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.list}>
                            {pendingSettlements.map((s) => (
                                <View
                                    key={`${s.fromMemberId}-${s.toMemberId}`}
                                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, shadows.low]}
                                >
                                    {/* Members */}
                                    <View style={styles.memberRow}>
                                        <View style={styles.memberSlot}>
                                            <Avatar name={s.fromMemberName} size={44} />
                                            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={1}>
                                                {s.fromMemberName}
                                            </Text>
                                        </View>

                                        <View style={styles.arrowCol}>
                                            <Icon name="action.send" size={20} color={colors.owe} />
                                            <Text style={[typography.monoLg, { color: colors.owe }]}>
                                                {formatRupees(s.amountMoney)}
                                            </Text>
                                        </View>

                                        <View style={styles.memberSlot}>
                                            <Avatar name={s.toMemberName} size={44} />
                                            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={1}>
                                                {s.toMemberName}
                                            </Text>
                                        </View>
                                    </View>

                                    <Pressable
                                        style={({ pressed }) => [
                                            styles.markPaidBtn,
                                            { backgroundColor: colors.accent },
                                            pressed && styles.btnPressed,
                                        ]}
                                        onPress={() => handleMarkPaid(s.fromMemberId, s.toMemberId, s.amountMoney)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Mark ${s.fromMemberName} payment to ${s.toMemberName} as paid`}
                                    >
                                        <Icon name="action.check" size={16} color={colors.textInverse} />
                                        <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '600' }]}>
                                            Mark as Paid
                                        </Text>
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    )
                )}

                {/* ── Settled tab ────────────────────────────────────── */}
                {tab === 'settled' && (
                    settledHistory.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Icon name="money.settle" size={48} color={colors.icon} />
                            <Text style={[typography.bodyMd, { color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center' }]}>
                                No settlements yet.{'\n'}Mark payments above to track them here.
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.list}>
                            {settledHistory.map((pair) => (
                                <View
                                    key={pair.key}
                                    style={[styles.settledCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                                >
                                    <View style={styles.settledRow}>
                                        <Avatar name={pair.fromMemberName} size={36} />
                                        <View style={styles.settledInfo}>
                                            <Text style={[typography.bodyMd, { color: colors.text }]}>
                                                {pair.fromMemberName}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                                paid {pair.toMemberName}
                                            </Text>
                                        </View>
                                        <View style={styles.settledAmount}>
                                            <Icon name="action.checkCircle" active size={14} color={colors.success} />
                                            <Text style={[typography.mono, { color: colors.success }]}>
                                                {formatRupees(pair.amountMoney)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )
                )}
            </ScrollView>

            {/* Confetti burst */}
            <Confetti show={showConfetti} />

            {pendingAction && (
                <ConfirmModal
                    visible
                    title="Confirm Payment"
                    message={`Mark ${pendingAction.fromMemberName}'s payment of ${formatRupees(pendingAction.amount)} to ${pendingAction.toMemberName} as paid?`}
                    confirmLabel="Mark as Paid"
                    confirmVariant="primary"
                    onConfirm={confirmAction}
                    onCancel={() => setPendingAction(null)}
                />
            )}
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    // Tab pills
    tabRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        padding: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tabPill: {
        flex: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },

    scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
    loadingRow: { alignItems: 'center', paddingVertical: spacing.lg },

    // Pending tab
    allSettledContainer: { alignItems: 'center', paddingTop: 60 },
    list: { gap: spacing.md },
    card: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md },
    memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    memberSlot: { alignItems: 'center', flex: 1 },
    arrowCol: { alignItems: 'center', flex: 1, gap: spacing.xs },
    markPaidBtn: {
        height: 44, borderRadius: radii.md,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    },
    btnPressed: { opacity: 0.75 },

    // Settled tab
    emptyState: { alignItems: 'center', paddingTop: 60 },
    settledCard: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
    settledRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    settledInfo: { flex: 1 },
    settledAmount: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});