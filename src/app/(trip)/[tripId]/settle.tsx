/**
 * app/(trip)/[tripId]/settle.tsx — Settle Up screen (Phase 5)
 *
 * Fix v2:
 *  - handleMarkPaid / handleUnmark now call setSplitSettled() for an
 *    immediate optimistic update before the network round-trip completes.
 *    Previously the UI waited for the realtime UPDATE event, which could
 *    take 1–3 s on a slow connection, making the button appear broken.
 *  - On network error the optimistic update is rolled back.
 */

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    Share,
    StyleSheet,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { ConnectionBanner } from '../../../components/ConnectionBanner';
import { useMembers } from '../../../hooks/useMembers';
import {
    markSettledBetweenMembers,
    unmarkSettledBetweenMembers,
} from '../../../services/expenseService';
import { buildGuestUrl } from '../../../services/memberService';
import { useExpenseStore } from '../../../stores/expenseStore';
import type { Settlement } from '../../../types/domain';
import { formatRupees } from '../../../utils/money';
import { calculateSettlements } from '../../../utils/settlement';

export default function SettleScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = isDark ? dark : light;

    const members = useMembers(tripId ?? '');

    const expenses = useExpenseStore((s) => s.expenses[tripId ?? ''] ?? []);
    const splits = useExpenseStore((s) => s.splits);
    const setSplitSettled = useExpenseStore((s) => s.setSplitSettled);

    const allSplits = useMemo(() => Object.values(splits).flat(), [splits]);

    const settlements = useMemo(
        () => calculateSettlements(expenses, allSplits, members),
        [expenses, allSplits, members],
    );

    const totalOwed = useMemo(
        () => settlements.reduce((sum, s) => sum + s.amountMoney, 0),
        [settlements],
    );

    const settledMap = useMemo<Record<string, boolean>>(() => {
        const map: Record<string, boolean> = {};
        for (const s of settlements) {
            const creditorExpenseIds = expenses
                .filter((e) => e.tripId === (tripId ?? '') && e.paidByMember === s.toMemberId)
                .map((e) => e.id);

            if (creditorExpenseIds.length === 0) {
                map[`${s.fromMemberId}:${s.toMemberId}`] = false;
                continue;
            }

            const relevantSplits = creditorExpenseIds.flatMap((expenseId) =>
                (splits[expenseId] ?? []).filter((sp) => sp.memberId === s.fromMemberId),
            );

            map[`${s.fromMemberId}:${s.toMemberId}`] =
                relevantSplits.length > 0 && relevantSplits.every((sp) => sp.isSettled);
        }
        return map;
    }, [settlements, expenses, splits, tripId]);

    const [markingPaid, setMarkingPaid] = useState<Record<string, boolean>>({});

    const settlementKey = (s: Settlement) => `${s.fromMemberId}:${s.toMemberId}`;

    // Helper: get creditor expense ids for a settlement
    const getCreditorExpenseIds = useCallback(
        (toMemberId: string) =>
            expenses
                .filter((e) => e.tripId === (tripId ?? '') && e.paidByMember === toMemberId)
                .map((e) => e.id),
        [expenses, tripId],
    );

    const handleMarkPaid = useCallback(
        async (settlement: Settlement) => {
            if (!tripId) return;
            const key = settlementKey(settlement);
            setMarkingPaid((p) => ({ ...p, [key]: true }));

            // Optimistic update — immediate UI feedback
            const creditorExpenseIds = getCreditorExpenseIds(settlement.toMemberId);
            setSplitSettled(creditorExpenseIds, settlement.fromMemberId, true);

            try {
                await markSettledBetweenMembers(
                    tripId,
                    settlement.fromMemberId,
                    settlement.toMemberId,
                );
            } catch (err) {
                // Rollback optimistic update
                setSplitSettled(creditorExpenseIds, settlement.fromMemberId, false);
                Alert.alert('Error', err instanceof Error ? err.message : 'Could not mark as paid.');
            } finally {
                setMarkingPaid((p) => ({ ...p, [key]: false }));
            }
        },
        [tripId, getCreditorExpenseIds, setSplitSettled],
    );

    const handleUnmark = useCallback(
        async (settlement: Settlement) => {
            if (!tripId) return;
            const key = settlementKey(settlement);
            Alert.alert(
                'Reopen settlement?',
                `Mark the payment from ${settlement.fromMemberName} to ${settlement.toMemberName} as unpaid again?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Reopen',
                        style: 'destructive',
                        onPress: async () => {
                            setMarkingPaid((p) => ({ ...p, [key]: true }));

                            // Optimistic update
                            const creditorExpenseIds = getCreditorExpenseIds(settlement.toMemberId);
                            setSplitSettled(creditorExpenseIds, settlement.fromMemberId, false);

                            try {
                                await unmarkSettledBetweenMembers(
                                    tripId,
                                    settlement.fromMemberId,
                                    settlement.toMemberId,
                                );
                            } catch (err) {
                                // Rollback
                                setSplitSettled(creditorExpenseIds, settlement.fromMemberId, true);
                                Alert.alert('Error', err instanceof Error ? err.message : 'Could not reopen.');
                            } finally {
                                setMarkingPaid((p) => ({ ...p, [key]: false }));
                            }
                        },
                    },
                ],
            );
        },
        [tripId, getCreditorExpenseIds, setSplitSettled],
    );

    const handleShareText = useCallback(async (s: Settlement) => {
        await Share.share({
            message: `${s.fromMemberName} owes ${s.toMemberName} ${formatRupees(s.amountMoney)} on Settravo`,
        });
    }, []);

    const handleShareGuestLink = useCallback(
        async (s: Settlement) => {
            const debtorMember = members.find((m) => m.id === s.fromMemberId);
            if (!debtorMember) return;
            const url = buildGuestUrl(debtorMember);
            if (!url) {
                Alert.alert('App user', `${s.fromMemberName} already has the app.`);
                return;
            }
            await Share.share({
                message: `Hi ${s.fromMemberName}! Your balance:\n${url}`,
                url,
            });
        },
        [members],
    );

    if (expenses.length === 0) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <Text style={styles.emptyIcon}>🧾</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No expenses yet</Text>
                <Text style={[styles.emptySub, { color: colors.subText }]}>
                    Add expenses first, then come back to settle up.
                </Text>
            </View>
        );
    }

    if (settlements.length === 0) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>All settled!</Text>
                <Text style={[styles.emptySub, { color: colors.subText }]}>
                    Everyone has paid their fair share. Nothing left to transfer.
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
            <ConnectionBanner />

            <FlatList
                data={settlements}
                keyExtractor={(_, i) => String(i)}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    <View style={styles.header}>
                        <Text style={[styles.headerSub, { color: colors.subText }]}>
                            Minimum transfers to clear all debts
                        </Text>
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, { color: colors.subText }]}>Total to transfer</Text>
                            <Text style={[styles.totalAmount, { color: colors.text }]}>
                                {formatRupees(totalOwed)}
                            </Text>
                        </View>
                    </View>
                }
                renderItem={({ item: s, index }) => {
                    const key = settlementKey(s);
                    const isMarking = markingPaid[key] ?? false;
                    const debtorMember = members.find((m) => m.id === s.fromMemberId);
                    const isGuest = debtorMember?.isGuest ?? false;
                    const isAlreadySettled = settledMap[key] ?? false;

                    return (
                        <View
                            style={[
                                styles.card,
                                {
                                    backgroundColor: colors.card,
                                    opacity: isAlreadySettled ? 0.6 : 1,
                                },
                            ]}
                        >
                            <View style={[styles.badge, { backgroundColor: isAlreadySettled ? colors.settled : colors.accent }]}>
                                <Text style={styles.badgeText}>{isAlreadySettled ? '✓' : index + 1}</Text>
                            </View>

                            <View style={styles.transferRow}>
                                <View style={styles.names}>
                                    <Text style={[styles.fromName, { color: colors.text }]}>
                                        {s.fromMemberName}
                                    </Text>
                                    <Text style={[styles.arrow, { color: colors.subText }]}>→</Text>
                                    <Text style={[styles.toName, { color: isAlreadySettled ? colors.settled : colors.accent }]}>
                                        {s.toMemberName}
                                    </Text>
                                </View>
                                <Text
                                    style={[
                                        styles.amount,
                                        {
                                            color: colors.text,
                                            textDecorationLine: isAlreadySettled ? 'line-through' : 'none',
                                        },
                                    ]}
                                >
                                    {formatRupees(s.amountMoney)}
                                </Text>
                            </View>

                            {isAlreadySettled && (
                                <Text style={[styles.settledLabel, { color: colors.settled }]}>
                                    ✓ Paid outside the app
                                </Text>
                            )}

                            <View style={styles.actions}>
                                <Pressable
                                    style={[
                                        styles.actionBtn,
                                        isAlreadySettled
                                            ? { borderColor: colors.border }
                                            : { backgroundColor: colors.settled },
                                        { opacity: isMarking ? 0.6 : 1 },
                                    ]}
                                    onPress={() =>
                                        isAlreadySettled ? handleUnmark(s) : handleMarkPaid(s)
                                    }
                                    disabled={isMarking}
                                >
                                    {isMarking ? (
                                        <ActivityIndicator
                                            size="small"
                                            color={isAlreadySettled ? colors.subText : '#fff'}
                                        />
                                    ) : (
                                        <Text
                                            style={[
                                                styles.actionBtnText,
                                                { color: isAlreadySettled ? colors.subText : '#fff' },
                                            ]}
                                        >
                                            {isAlreadySettled ? 'Reopen' : 'Mark as paid'}
                                        </Text>
                                    )}
                                </Pressable>

                                <Pressable
                                    style={[styles.actionBtn, { borderColor: colors.border }]}
                                    onPress={() => handleShareText(s)}
                                >
                                    <Text style={[styles.actionBtnText, { color: colors.subText }]}>Share</Text>
                                </Pressable>

                                {isGuest && (
                                    <Pressable
                                        style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                                        onPress={() => handleShareGuestLink(s)}
                                    >
                                        <Text style={[styles.actionBtnText, { color: '#fff' }]}>
                                            Send link
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        </View>
                    );
                }}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
    emptySub: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
    list: { padding: 16, paddingBottom: 48 },
    header: { marginBottom: 20 },
    headerSub: { fontSize: 13, marginBottom: 8 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    totalLabel: { fontSize: 15 },
    totalAmount: { fontSize: 28, fontWeight: '700' },
    card: { borderRadius: 18, padding: 16, position: 'relative' },
    badge: {
        position: 'absolute', top: -8, left: 16,
        width: 24, height: 24, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    transferRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginTop: 8, marginBottom: 12,
    },
    names: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    fromName: { fontSize: 17, fontWeight: '600' },
    arrow: { fontSize: 18 },
    toName: { fontSize: 17, fontWeight: '600' },
    amount: { fontSize: 20, fontWeight: '700' },
    settledLabel: { fontSize: 13, fontWeight: '500', marginBottom: 10 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actionBtn: {
        borderWidth: 1, borderRadius: 10,
        paddingVertical: 8, paddingHorizontal: 14,
        minWidth: 80, alignItems: 'center', justifyContent: 'center',
    },
    actionBtnText: { fontSize: 13, fontWeight: '600' },
});

const light = {
    bg: '#f2f2f7', text: '#000000', subText: '#6c6c70',
    card: '#ffffff', accent: '#007aff', border: '#c6c6c8', settled: '#34c759',
};
const dark = {
    bg: '#000000', text: '#ffffff', subText: '#8e8e93',
    card: '#1c1c1e', accent: '#0a84ff', border: '#38383a', settled: '#30d158',
};