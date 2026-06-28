/**
 * settle.tsx
 *
 * Settle Up screen.
 *
 * Phase 4 changes:
 *  4.4  Avatar cards per settlement (from/to member display)
 *  4.4  "All settled" celebration state
 *  4.9  Haptic feedback on mark/unmark settled
 *  2.3  useThemeColors() — no inline light/dark
 *  2.4  useToast() — no Alert.alert
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
import { useColorScheme } from 'react-native';

export default function SettleScreen() {
    const { tripId }     = useLocalSearchParams<{ tripId: string }>();
    const router         = useRouter();
    const colors         = useThemeColors();
    const { showToast }  = useToast();
    const isDark         = useColorScheme() === 'dark'; // for MemberAvatar only

    const splits   = useExpenseStore((s) => s.splits);
    const expenses = useExpenseStore(
        (s) => (tripId ? (s.expenses[tripId] ?? []) : []),
    );
    const members = useMembers(tripId ?? '');

    const allSplits   = useMemo(() => Object.values(splits).flat(), [splits]);
    const settlements = useMemo(
        () => calculateSettlements(expenses, allSplits, members),
        [expenses, allSplits, members],
    );
    const allSettled = expenses.length > 0 && settlements.length === 0;

    const [loadingId, setLoadingId]       = useState<string | null>(null);
    const [confirmData, setConfirmData]   = useState<{
        debtorId: string; creditorId: string; amount: number;
        debtorName: string; creditorName: string;
    } | null>(null);
    const [unmarkData, setUnmarkData]     = useState<{
        debtorId: string; creditorId: string;
    } | null>(null);

    const handleMarkSettled = useCallback(async () => {
        if (!confirmData || !tripId) return;
        const { debtorId, creditorId } = confirmData;
        const key = `${debtorId}-${creditorId}`;
        setLoadingId(key);
        try {
            await markSettledBetweenMembers(tripId, debtorId, creditorId);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast({ message: 'Marked as settled ✓', variant: 'success' });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : 'Could not mark settled.',
                variant: 'error',
            });
        } finally {
            setLoadingId(null);
            setConfirmData(null);
        }
    }, [confirmData, tripId, showToast]);

    const handleUnmark = useCallback(async () => {
        if (!unmarkData || !tripId) return;
        const { debtorId, creditorId } = unmarkData;
        const key = `${debtorId}-${creditorId}`;
        setLoadingId(key);
        try {
            await unmarkSettledBetweenMembers(tripId, debtorId, creditorId);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            showToast({ message: 'Settlement reopened', variant: 'info' });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : 'Could not reopen.',
                variant: 'error',
            });
        } finally {
            setLoadingId(null);
            setUnmarkData(null);
        }
    }, [unmarkData, tripId, showToast]);

    // ── All settled ───────────────────────────────────────────────────────────
    if (allSettled) {
        return (
            <View style={[styles.root, { backgroundColor: colors.bg }]}>
                <View style={styles.celebrationContainer}>
                    <Text style={styles.celebrationEmoji}>🎉</Text>
                    <Text style={[styles.celebrationTitle, { color: colors.text }]}>
                        All Settled!
                    </Text>
                    <Text style={[styles.celebrationSub, { color: colors.subText }]}>
                        Everyone's square. Time for the next adventure.
                    </Text>
                    <Pressable
                        style={[styles.doneButton, { backgroundColor: colors.accent }]}
                        onPress={() => router.back()}
                    >
                        <Text style={styles.doneButtonText}>Done</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ── No expenses ───────────────────────────────────────────────────────────
    if (expenses.length === 0) {
        return (
            <View style={[styles.root, { backgroundColor: colors.bg }]}>
                <View style={styles.celebrationContainer}>
                    <Text style={styles.celebrationEmoji}>💳</Text>
                    <Text style={[styles.celebrationTitle, { color: colors.text }]}>
                        No expenses yet
                    </Text>
                    <Text style={[styles.celebrationSub, { color: colors.subText }]}>
                        Add expenses to see who owes what.
                    </Text>
                </View>
            </View>
        );
    }

    // ── Settlement list ───────────────────────────────────────────────────────
    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.pageTitle, { color: colors.subText }]}>
                    {settlements.length} settlement{settlements.length !== 1 ? 's' : ''} remaining
                </Text>

                {settlements.map((s) => {
                    const fromMember = members.find((m) => m.id === s.fromMemberId);
                    const toMember   = members.find((m) => m.id === s.toMemberId);
                    const key        = `${s.fromMemberId}-${s.toMemberId}`;
                    const isLoading  = loadingId === key;

                    return (
                        <View key={key} style={[styles.settlementCard, { backgroundColor: colors.card }]}>
                            {/* From member */}
                            <View style={styles.memberCol}>
                                {fromMember && (
                                    <MemberAvatar
                                        member={fromMember}
                                        isDark={isDark}
                                        size={48}
                                        allMembers={members}
                                    />
                                )}
                                <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                                    {s.fromMemberName}
                                </Text>
                                <Text style={[styles.memberRole, { color: colors.subText }]}>owes</Text>
                            </View>

                            {/* Amount + arrow */}
                            <View style={styles.amountCol}>
                                <Text style={[styles.arrow, { color: colors.separator }]}>→</Text>
                                <Text style={[styles.amount, { color: colors.text }]}>
                                    {formatRupees(s.amountMoney)}
                                </Text>
                            </View>

                            {/* To member */}
                            <View style={styles.memberCol}>
                                {toMember && (
                                    <MemberAvatar
                                        member={toMember}
                                        isDark={isDark}
                                        size={48}
                                        allMembers={members}
                                    />
                                )}
                                <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                                    {s.toMemberName}
                                </Text>
                                <Text style={[styles.memberRole, { color: colors.subText }]}>receives</Text>
                            </View>

                            {/* Mark settled button */}
                            <Pressable
                                style={[styles.markButton, { backgroundColor: colors.accentSuccess }]}
                                onPress={() => setConfirmData({
                                    debtorId:    s.fromMemberId,
                                    creditorId:  s.toMemberId,
                                    amount:      s.amountMoney,
                                    debtorName:  s.fromMemberName,
                                    creditorName: s.toMemberName,
                                })}
                                disabled={isLoading}
                                accessibilityRole="button"
                                accessibilityLabel={`Mark ${s.fromMemberName}'s payment to ${s.toMemberName} as settled`}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.markButtonText}>Mark Settled</Text>
                                )}
                            </Pressable>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Mark settled confirmation */}
            <ConfirmModal
                visible={confirmData !== null}
                title="Mark as settled?"
                message={
                    confirmData
                        ? `${confirmData.debtorName} paid ${formatRupees(confirmData.amount)} to ${confirmData.creditorName}?`
                        : ''
                }
                confirmLabel="Yes, Settled"
                confirmVariant="primary"
                onConfirm={handleMarkSettled}
                onCancel={() => setConfirmData(null)}
            />

            {/* Unmark confirmation */}
            <ConfirmModal
                visible={unmarkData !== null}
                title="Reopen settlement?"
                message="This will unmark the settlement and include it in the outstanding balance again."
                confirmLabel="Reopen"
                confirmVariant="destructive"
                onConfirm={handleUnmark}
                onCancel={() => setUnmarkData(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root:    { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 40 },

    pageTitle: { fontSize: 13, fontWeight: '500', marginBottom: 4 },

    settlementCard: {
        borderRadius: 16,
        padding: 16,
        gap: 12,
        alignItems: 'center',
    },
    memberCol:  {
        alignItems: 'center',
        gap: 4,
        flex: 1,
        minWidth: 0,
    },
    memberName: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
    memberRole: { fontSize: 11 },

    amountCol:  { alignItems: 'center', gap: 2 },
    arrow:      { fontSize: 18 },
    amount:     { fontSize: 20, fontWeight: '700' },

    markButton: {
        width: '100%',
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    markButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

    // Celebration
    celebrationContainer: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32, paddingBottom: 60,
    },
    celebrationEmoji: { fontSize: 72, marginBottom: 20 },
    celebrationTitle: { fontSize: 28, fontWeight: '700', marginBottom: 10 },
    celebrationSub:   { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40 },
    doneButton: {
        width: '100%', height: 52, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});