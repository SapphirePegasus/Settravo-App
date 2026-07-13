/**
 * app/(trip)/[tripId]/settle.tsx — Settle Up (Phase-2 rewrite)
 *
 * What changed and why:
 *  - Pending list now comes from the pairwise ledger (utils/settlement.ts):
 *    every card is a real debt between two people, netted only within the
 *    pair. No more invented A→C transfers from greedy netting.
 *  - "Mark as Paid" calls settlePairBetweenMembers → settravo_settle_pair
 *    RPC, which flips BOTH directions between the pair in one transaction
 *    and returns the exact rows it changed. We apply those rows verbatim
 *    (applyServerSplits) — the local optimistic guesswork that caused the
 *    old inconsistencies is gone.
 *  - Settled tab gained "Undo" (settlePair with settled=false) so a
 *    mis-tap is recoverable — a money app must never have one-way buttons.
 *  - Offline (Phase 3): settling now QUEUES instead of blocking. The flip is
 *    applied optimistically using the same pairwise rule the server enforces
 *    (both directions of unsettled debt between the two members), persisted
 *    to the local cache, and replayed by useOfflineSync on reconnect — where
 *    the server's returned rows overwrite the optimistic state, resolving
 *    any concurrent-settle races in the server's favour.
 *  - Failures are reported to Sentry with context (tripId, pair) so
 *    recurring settle errors show up grouped in the dashboard.
 */

import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as Sentry from '@sentry/react-native';
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
import { cacheSplits } from '../../../lib/localCache';
import { settlePairBetweenMembers } from '../../../services/expenseService';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useExpenseStore } from '../../../stores/expenseStore';
import { useTripStore } from '../../../stores/tripStore';
import {
    calculateSettlements,
    calculateSettledHistory,
    type SettledPair,
} from '../../../utils/settlement';
import { formatRupees } from '../../../utils/money';
import { spacing, typography, radii, shadows } from '@/theme';
import type { Split } from '../../../types/domain';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabMode = 'pending' | 'settled';

interface PendingAction {
    mode: 'settle' | 'undo';
    memberAId: string;
    memberBId: string;
    memberAName: string;
    memberBName: string;
    /** Net amount for 'settle' (display only); gross direction amount for 'undo'. */
    amountMoney: number;
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#22C55E', '#FBBF24', '#3B82F6', '#EC4899', '#8B5CF6', '#F97316'];
const CONFETTI_COUNT = 16;

function ConfettiParticle({ index }: { index: number }) {
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
        opacity.value = withDelay(delay + 800, withTiming(0, { duration: 400 }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <ConfettiParticle key={i} index={i} />
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettleScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const { expenses } = useExpenses(tripId ?? '');
    const members = useMembers(tripId ?? '');
    const allSplits = useExpenseStore((s) => s.splits);
    const applyServerSplits = useExpenseStore((s) => s.applyServerSplits);
    const enqueueOfflineItem = useTripStore((s) => s.enqueueOfflineItem);
    const networkOnline = useConnectionStore((s) => s.networkOnline);

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

    const allSettled = expenses.length > 0 && pendingSettlements.length === 0;

    // Confetti fires on each transition INTO the all-settled state
    // (re-armed if an undo brings debts back).
    const confettiTriggered = useRef(false);
    useEffect(() => {
        if (allSettled && !confettiTriggered.current) {
            confettiTriggered.current = true;
            setShowConfetti(true);
            const t = setTimeout(() => setShowConfetti(false), 1800);
            return () => clearTimeout(t);
        }
        if (!allSettled) {
            confettiTriggered.current = false;
        }
    }, [allSettled]);

    // ── Actions ────────────────────────────────────────────────────────────────

    /**
     * The same rule settravo_settle_pair applies server-side: every split in
     * BOTH directions between the pair whose is_settled !== target state.
     * Used for the optimistic offline flip so local math matches the server's.
     */
    const splitsBetweenPair = useCallback(
        (aId: string, bId: string, targetSettled: boolean): Split[] => {
            const payerByExpense = new Map(expenses.map((e) => [e.id, e.paidByMember]));
            return flatSplits.filter((sp) => {
                if (sp.isSettled === targetSettled) return false;
                const payer = payerByExpense.get(sp.expenseId);
                if (!payer || sp.memberId === payer) return false;
                return (
                    (sp.memberId === aId && payer === bId) ||
                    (sp.memberId === bId && payer === aId)
                );
            });
        },
        [expenses, flatSplits],
    );

    const confirmAction = useCallback(async () => {
        if (!pendingAction || !tripId) return;
        setLoading(true);
        const settled = pendingAction.mode === 'settle';

        try {
            if (networkOnline) {
                // ── Online: server is the source of truth ─────────────────
                const changedRows = await settlePairBetweenMembers(
                    tripId,
                    pendingAction.memberAId,
                    pendingAction.memberBId,
                    settled,
                );
                applyServerSplits(changedRows);
                cacheSplits(tripId, changedRows);

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast({
                    message: settled
                        ? changedRows.length > 0
                            ? 'Marked as settled'
                            : 'Already settled — nothing to update'
                        : 'Settlement undone',
                    variant: 'success',
                });
            } else {
                // ── Offline: optimistic flip + queue for replay ───────────
                const affected = splitsBetweenPair(
                    pendingAction.memberAId,
                    pendingAction.memberBId,
                    settled,
                );
                const flipped = affected.map((sp) => ({ ...sp, isSettled: settled }));
                applyServerSplits(flipped);
                cacheSplits(tripId, flipped);

                await enqueueOfflineItem({
                    type: 'SETTLE_PAIR',
                    localId: Crypto.randomUUID(),
                    retryCount: 0,
                    lastFailedAt: null,
                    payload: {
                        tripId,
                        memberAId: pendingAction.memberAId,
                        memberBId: pendingAction.memberBId,
                        settled,
                    },
                });

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast({
                    message: settled
                        ? "Marked as settled — will sync when you're online"
                        : "Undone — will sync when you're online",
                    variant: 'success',
                });
            }
        } catch (err) {
            Sentry.captureException(err, {
                tags: { feature: 'settle' },
                extra: {
                    tripId,
                    memberA: pendingAction.memberAId,
                    memberB: pendingAction.memberBId,
                    mode: pendingAction.mode,
                    online: networkOnline,
                },
            });
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showToast({
                message: err instanceof Error ? err.message : 'Failed to update settlement',
                variant: 'error',
            });
        } finally {
            setLoading(false);
            setPendingAction(null);
        }
    }, [
        pendingAction,
        tripId,
        networkOnline,
        applyServerSplits,
        enqueueOfflineItem,
        splitsBetweenPair,
        showToast,
    ]);

    const handleMarkPaid = useCallback(
        (fromId: string, toId: string, fromName: string, toName: string, amount: number) => {
            setPendingAction({
                mode: 'settle',
                memberAId: fromId,
                memberBId: toId,
                memberAName: fromName,
                memberBName: toName,
                amountMoney: amount,
            });
        },
        [],
    );

    const handleUndo = useCallback(
        (pair: SettledPair) => {
            setPendingAction({
                mode: 'undo',
                memberAId: pair.fromMemberId,
                memberBId: pair.toMemberId,
                memberAName: pair.fromMemberName,
                memberBName: pair.toMemberName,
                amountMoney: pair.amountMoney,
            });
        },
        [],
    );

    // ── Render ─────────────────────────────────────────────────────────────────

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
                                        onPress={() => handleMarkPaid(
                                            s.fromMemberId, s.toMemberId,
                                            s.fromMemberName, s.toMemberName,
                                            s.amountMoney,
                                        )}
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
                                        <Pressable
                                            onPress={() => handleUndo(pair)}
                                            hitSlop={8}
                                            style={styles.undoBtn}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Undo settlement between ${pair.fromMemberName} and ${pair.toMemberName}`}
                                        >
                                            <Text style={[typography.caption, { color: colors.accent, fontWeight: '600' }]}>
                                                Undo
                                            </Text>
                                        </Pressable>
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
                    title={pendingAction.mode === 'settle' ? 'Confirm Payment' : 'Undo Settlement'}
                    message={
                        pendingAction.mode === 'settle'
                            ? `Settle everything between ${pendingAction.memberAName} and ${pendingAction.memberBName}? Net amount: ${formatRupees(pendingAction.amountMoney)}.`
                            : `Move all settled amounts between ${pendingAction.memberAName} and ${pendingAction.memberBName} back to "To Settle"?`
                    }
                    confirmLabel={pendingAction.mode === 'settle' ? 'Mark as Paid' : 'Undo'}
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
    undoBtn: { paddingLeft: spacing.sm, paddingVertical: spacing.xs },
});