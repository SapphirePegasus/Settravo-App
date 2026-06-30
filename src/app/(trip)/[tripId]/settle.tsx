/**
 * app/(trip)/[tripId]/settle.tsx — Settle Up
 *
 * 🎉 emoji replaced with <Icon name="status.celebration" />
 * ← back arrow text replaced with <Icon name="header.back" />
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

interface PendingAction {
    fromMemberId: string;
    toMemberId: string;
    fromMemberName: string;
    toMemberName: string;
    amount: number;
    expenseIds: string[];
}

export default function SettleScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const { expenses } = useExpenses(tripId ?? '');
    const members = useMembers(tripId ?? '');
    const allSplits = useExpenseStore((s) => s.splits);
    const setSplitSettled = useExpenseStore((s) => s.setSplitSettled);

    const [loading, setLoading] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    const flatSplits = useMemo(() => {
        const result = [];
        for (const exp of expenses) {
            for (const sp of allSplits[exp.id] ?? []) {
                result.push(sp);
            }
        }
        return result;
    }, [expenses, allSplits]);

    const settlements = useMemo(
        () => calculateSettlements(expenses, flatSplits, members),
        [expenses, flatSplits, members],
    );

    const memberNameMap = useMemo(
        () => new Map(members.map((m) => [m.id, m.displayName])),
        [members],
    );

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

    const allSettled = settlements.length === 0;

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.separator }]}>
                <Pressable
                    onPress={() => router.back()}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Icon name="header.back" size={24} color={colors.accent} />
                </Pressable>
                <Text style={[typography.title, { color: colors.text }]}>Settle Up</Text>
                <View style={styles.backButton} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                )}

                {allSettled ? (
                    <View style={styles.allSettled}>
                        <Icon name="status.celebration" size={64} color={colors.success} />
                        <Text style={[typography.title, { color: colors.text, textAlign: 'center', marginTop: spacing.md }]}>
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
                                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, shadows.low]}
                            >
                                <View style={styles.memberRow}>
                                    <View style={styles.memberSlot}>
                                        <Avatar name={s.fromMemberName} size={40} />
                                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={1}>
                                            {s.fromMemberName}
                                        </Text>
                                    </View>

                                    <View style={styles.arrowCol}>
                                        <Icon name="action.send" size={22} color={colors.owe} />
                                        <Text style={[typography.monoLg, { color: colors.owe }]}>
                                            {formatRupees(s.amountMoney)}
                                        </Text>
                                    </View>

                                    <View style={styles.memberSlot}>
                                        <Avatar name={s.toMemberName} size={40} />
                                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={1}>
                                            {s.toMemberName}
                                        </Text>
                                    </View>
                                </View>

                                <Pressable
                                    style={({ pressed }) => [
                                        styles.paidButton,
                                        { borderColor: colors.accent },
                                        pressed && styles.paidButtonPressed,
                                    ]}
                                    onPress={() => handleMarkPaid(s.fromMemberId, s.toMemberId, s.amountMoney)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Mark ${s.fromMemberName} payment to ${s.toMemberName} as paid`}
                                >
                                    <Text style={[typography.bodyMd, { color: colors.accent }]}>Mark as Paid</Text>
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

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

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.md, paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backButton: { width: 40, alignItems: 'flex-start' },
    scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
    loadingOverlay: { alignItems: 'center', paddingVertical: spacing.lg },
    allSettled: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    settlementList: { gap: spacing.md },
    card: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md },
    memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    memberSlot: { alignItems: 'center', flex: 1 },
    arrowCol: { alignItems: 'center', flex: 1, gap: spacing.xs },
    paidButton: { height: 44, borderRadius: radii.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    paidButtonPressed: { opacity: 0.7 },
});