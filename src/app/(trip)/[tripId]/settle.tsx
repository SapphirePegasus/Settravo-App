/**
 * app/(trip)/[tripId]/settle.tsx
 *
 * Settle Up screen — per-group settlement view.
 *
 * Shows all debts between members with "Mark as Paid" actions.
 * "All settled" celebration state when no outstanding debts remain.
 *
 * REFACTOR (Phase B):
 *  - Removed isDark / useColorScheme() — all colors from useThemeColors()
 *  - MemberAvatar no longer receives isDark prop (MemberAvatar refactored separately)
 *  - Tab segmented control stub kept for Phase D.9 — currently shows all settlements
 *
 * Existing functionality unchanged:
 *  - markSettledBetweenMembers / unmarkSettledBetweenMembers
 *  - Settlement calculation from useExpenseStore
 *  - Haptic feedback
 *  - ConfirmModal before marking paid
 */

import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmModal } from '../../../components/modals/ConfirmModal';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { useToast } from '../../../components/Toast';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useMembers } from '../../../hooks/useMembers';
import {
    markSettledBetweenMembers,
    unmarkSettledBetweenMembers,
} from '../../../services/expenseService';
import { useExpenseStore } from '../../../stores/expenseStore';
import { calculateSettlements } from '../../../utils/settlement';
import { formatRupees } from '../../../utils/money';
import { spacing, typography, radii, shadows } from '@/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingAction {
    fromMemberId: string;
    toMemberId: string;
    fromMemberName: string;
    toMemberName: string;
    amount: number;
    action: 'settle' | 'unsettle';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettleScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const splitsRecord = useExpenseStore((s) => s.splits);
    const expenses = useExpenseStore(
        (s) => (tripId ? (s.expenses[tripId] ?? []) : []),
    );
    const members = useMembers(tripId ?? '');

    const [loading, setLoading] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    // calculateSettlements expects a flat Split[] — flatten the keyed record
    const flatSplits = useMemo(() => Object.values(splitsRecord).flat(), [splitsRecord]);

    // ── Derived data ──────────────────────────────────────────────────────────

    const settlements = useMemo(
        () => calculateSettlements(expenses, flatSplits, members),
        [expenses, flatSplits, members],
    );

    const memberNameMap = useMemo(
        () => new Map(members.map((m) => [m.id, m.displayName])),
        [members],
    );

    // ── Handlers ──────────────────────────────────────────────────────────────

    const confirmAction = useCallback(async () => {
        if (!pendingAction || !tripId) return;

        setLoading(true);
        try {
            if (pendingAction.action === 'settle') {
                await markSettledBetweenMembers(
                    tripId,
                    pendingAction.fromMemberId,
                    pendingAction.toMemberId,
                );
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast({ message: 'Marked as paid ✓', variant: 'success' });
            } else {
                await unmarkSettledBetweenMembers(
                    tripId,
                    pendingAction.fromMemberId,
                    pendingAction.toMemberId,
                );
                showToast({ message: 'Marked as unpaid', variant: 'info' });
            }
        } catch {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showToast({ message: 'Failed to update settlement', variant: 'error' });
        } finally {
            setLoading(false);
            setPendingAction(null);
        }
    }, [pendingAction, tripId, showToast]);

    const handleMarkPaid = useCallback(
        (fromMemberId: string, toMemberId: string, amount: number) => {
            const fromName = memberNameMap.get(fromMemberId) ?? 'Unknown';
            const toName = memberNameMap.get(toMemberId) ?? 'Unknown';
            setPendingAction({ fromMemberId, toMemberId, fromMemberName: fromName, toMemberName: toName, amount, action: 'settle' });
        },
        [memberNameMap],
    );

    // ── Render ────────────────────────────────────────────────────────────────

    const allSettled = settlements.length === 0;

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: colors.bg }]}
            edges={['top', 'left', 'right']}
        >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.separator }]}>
                <Pressable
                    onPress={() => router.back()}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Text style={[styles.backArrow, { color: colors.accent }]}>←</Text>
                </Pressable>
                <Text style={[typography.title, { color: colors.text }]}>Settle Up</Text>
                <View style={styles.backButton} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                )}

                {/* All settled celebration */}
                {allSettled ? (
                    <View style={styles.allSettled}>
                        <Text style={styles.celebrationEmoji}>🎉</Text>
                        <Text style={[typography.title, { color: colors.text, textAlign: 'center' }]}>
                            All settled up!
                        </Text>
                        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                            Everyone's even. Time to plan the next trip!
                        </Text>
                    </View>
                ) : (
                    <View style={styles.settlementList}>
                        {settlements.map((s) => (
                            <View
                                key={`${s.fromMemberId}-${s.toMemberId}`}
                                style={[
                                    styles.card,
                                    {
                                        backgroundColor: colors.card,
                                        borderColor: colors.cardBorder,
                                        ...shadows.low,
                                    },
                                ]}
                            >
                                {/* From → To member row */}
                                <View style={styles.memberRow}>
                                    <View style={styles.memberSlot}>
                                        <MemberAvatar
                                            name={s.fromMemberName}
                                            size={40}
                                        />
                                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={1}>
                                            {s.fromMemberName}
                                        </Text>
                                    </View>

                                    <View style={styles.arrowCol}>
                                        <Text style={[styles.arrow, { color: colors.owe }]}>→</Text>
                                        <Text style={[typography.monoLg, { color: colors.owe }]}>
                                            {formatRupees(s.amountMoney)}
                                        </Text>
                                    </View>

                                    <View style={styles.memberSlot}>
                                        <MemberAvatar
                                            name={s.toMemberName}
                                            size={40}
                                        />
                                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={1}>
                                            {s.toMemberName}
                                        </Text>
                                    </View>
                                </View>

                                {/* Mark as Paid */}
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.paidButton,
                                        { borderColor: colors.accent },
                                        pressed && styles.paidButtonPressed,
                                    ]}
                                    onPress={() =>
                                        handleMarkPaid(s.fromMemberId, s.toMemberId, s.amountMoney)
                                    }
                                    accessibilityRole="button"
                                    accessibilityLabel={`Mark ${s.fromMemberName} payment to ${s.toMemberName} as paid`}
                                >
                                    <Text style={[typography.bodyMd, { color: colors.accent }]}>
                                        Mark as Paid
                                    </Text>
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Confirm modal */}
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
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backButton: {
        width: 40,
        alignItems: 'flex-start',
    },
    backArrow: {
        fontSize: 24,
    },
    scrollContent: {
        padding: spacing.md,
        paddingBottom: spacing.xxl,
    },
    loadingOverlay: {
        alignItems: 'center',
        paddingVertical: spacing.lg,
    },
    allSettled: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    celebrationEmoji: {
        fontSize: 64,
        marginBottom: spacing.md,
    },
    settlementList: {
        gap: spacing.md,
    },
    card: {
        borderRadius: radii.lg,
        borderWidth: 1,
        padding: spacing.md,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    memberSlot: {
        alignItems: 'center',
        flex: 1,
    },
    arrowCol: {
        alignItems: 'center',
        flex: 1,
        gap: spacing.xs,
    },
    arrow: {
        fontSize: 24,
        fontWeight: '300',
    },
    paidButton: {
        height: 44,
        borderRadius: radii.md,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    paidButtonPressed: {
        opacity: 0.7,
    },
});