/**
 * app/(trip)/[tripId]/index.tsx — Trip Detail screen (Phase 4)
 *
 * Phase 4 changes over Phase 3:
 *  - Members loaded via useMembers() → memberStore (shared with settle + add-expense).
 *  - "Send guest link" button in member list for guest members.
 *  - addGuestMember now calls memberStore.addMember() so the new member
 *    appears instantly in the settle screen too.
 */

import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, Modal,
    Pressable, SectionList,
    Share,
    StyleSheet,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { AddMemberModal } from '../../../components/AddMemberModal';
import { ConnectionBanner } from '../../../components/ConnectionBanner';
import { ExpenseRow } from '../../../components/ExpenseRow';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { useExpenses } from '../../../hooks/useExpenses';
import { useMembers } from '../../../hooks/useMembers';
import { deleteExpense } from '../../../services/expenseService';
import { buildGuestUrl } from '../../../services/memberService';
import { addGuestMember, getTrip } from '../../../services/tripService';
import { useAuthStore } from '../../../stores/authStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useExpenseStore } from '../../../stores/expenseStore';
import { useMemberStore } from '../../../stores/memberStore';
import { useTripStore } from '../../../stores/tripStore';
import type { Trip } from '../../../types/domain';
import { formatRupees } from '../../../utils/money';
import { calculateSettlements } from '../../../utils/settlement';

// ─── Expense list share formatter ─────────────────────────────────────────────

function buildShareText(trip: Trip, expenses: ReturnType<typeof useExpenses>['expenses'], members: ReturnType<typeof useMembers>): string {
    const memberNameMap = new Map(members.map((m) => [m.id, m.displayName]));

    const totalPaise = expenses.reduce((sum, e) => sum + e.amountMoney, 0);

    const CATEGORY_EMOJI: Record<string, string> = {
        food: '🍽',
        transport: '🚗',
        stay: '🏨',
        misc: '📦',
    };

    const lines: string[] = [];
    lines.push(`🧳 *${trip.name}${trip.destination ? ` — ${trip.destination}` : ''}*`);
    lines.push('');
    lines.push('📋 *Expense List*');
    lines.push('─────────────────');

    for (const expense of [...expenses].reverse()) {
        // oldest first for chronological reading
        const emoji = expense.category ? (CATEGORY_EMOJI[expense.category] ?? '💳') : '💳';
        const payer = memberNameMap.get(expense.paidByMember) ?? '?';
        const rupees = formatRupees(expense.amountMoney);
        lines.push(`${emoji} ${expense.title} — ${rupees} _(paid by ${payer})_`);
    }

    lines.push('─────────────────');
    lines.push(`💰 *Total: ${formatRupees(totalPaise)}*`);
    lines.push('');
    lines.push('_(Shared via Settravo)_');

    return lines.join('\n');
}

export default function TripDetailScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const navigation = useNavigation();
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = isDark ? dark : light;

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const splits = useExpenseStore((s) => s.splits);
    const removeExpenseFromStore = useExpenseStore((s) => s.removeExpense);
    const storeMember = useMemberStore((s) => s.addMember);

    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const enqueueOfflineItem = useTripStore((s) => s.enqueueOfflineItem);

    const [trip, setTrip] = useState<Trip | null>(null);
    const [tripLoading, setTripLoading] = useState(true);
    const [addMemberVisible, setAddMemberVisible] = useState(false);

    const members = useMembers(tripId ?? '');
    const { expenses, isLoading: expensesLoading, reconnectRealtime } = useExpenses(tripId ?? '');

    const loadTrip = useCallback(async () => {
        if (!tripId) return;
        setTripLoading(true);
        try {
            const fetchedTrip = await getTrip(tripId);
            if (fetchedTrip) {
                setTrip(fetchedTrip);
                navigation.setOptions({ title: fetchedTrip.name });
            }
        } finally {
            setTripLoading(false);
        }
    }, [tripId, navigation]);

    useEffect(() => { loadTrip(); }, [loadTrip]);

    const myMember = members.find((m) => m.deviceId === deviceUser?.id);

    const allSplits = Object.values(splits).flat();
    const settlements = calculateSettlements(expenses, allSplits, members);
    const allSettled = expenses.length > 0 && settlements.length === 0;

    const handleDeleteExpense = useCallback(async (expenseId: string) => {
        if (!tripId) return;

        if (!networkOnline) {
            // Optimistic remove — will be synced to the server on reconnect
            removeExpenseFromStore(tripId, expenseId);
            await enqueueOfflineItem({
                type: 'DELETE_EXPENSE',
                localId: Crypto.randomUUID(),
                retryCount: 0,
                lastFailedAt: null,
                payload: { expenseId, tripId },
            });
            return;
        }

        try {
            await deleteExpense(expenseId);
            removeExpenseFromStore(tripId, expenseId);
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete.');
        }
    }, [tripId, networkOnline, removeExpenseFromStore, enqueueOfflineItem]);

    const handleAddMember = useCallback(async (name: string) => {
        if (!tripId) return;
        const newMember = await addGuestMember(tripId, name);
        storeMember(tripId, newMember);
    }, [tripId, storeMember]);

    const handleShareGuestLink = useCallback(async (memberId: string) => {
        const member = members.find((m) => m.id === memberId);
        if (!member) return;
        const url = buildGuestUrl(member);
        if (!url) {
            Alert.alert('App user', `${member.displayName} already has the app.`);
            return;
        }
        await Share.share({
            message: `Hi ${member.displayName}! Check your trip balance here:\n${url}`,
            url,
        });
    }, [members]);

    const handleShareExpenseList = useCallback(async () => {
        if (!trip || expenses.length === 0) return;
        const text = buildShareText(trip, expenses, members);
        await Share.share({ message: text });
    }, [trip, expenses, members]);

    if (tripLoading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={isDark ? '#fff' : '#000'} />
            </View>
        );
    }

    const sections = [
        { title: 'members', data: ['members'] as string[] },
        { title: 'summary', data: ['summary'] as string[] },
        { title: 'expenses', data: expenses.map((e) => e.id) },
    ];

    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
            <ConnectionBanner onReconnect={reconnectRealtime} />

            <SectionList
                sections={sections}
                keyExtractor={(item) => item}
                contentContainerStyle={styles.content}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                renderSectionHeader={({ section }) =>
                    section.title === 'expenses' && expenses.length > 0 ? (
                        <View style={styles.expensesHeader}>
                            <Text style={[styles.sectionLabel, { color: colors.subText }]}>Expenses</Text>
                            {expenses.length > 0 && (
                                <Pressable onPress={handleShareExpenseList} hitSlop={8}>
                                    <Text style={[styles.shareListBtn, { color: colors.accent }]}>
                                        Share List
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    ) : null
                }
                renderItem={({ item, section }) => {
                    if (section.title === 'members') {
                        return (
                            <View style={[styles.card, { backgroundColor: colors.card }]}>
                                <View style={styles.cardHeader}>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>Members</Text>
                                    <Pressable onPress={() => setAddMemberVisible(true)}>
                                        <Text style={[styles.cardAction, { color: colors.accent }]}>+ Add</Text>
                                    </Pressable>
                                </View>
                                <View style={styles.membersRow}>
                                    {members.map((m) => (
                                        <Pressable
                                            key={m.id}
                                            onLongPress={() => m.isGuest && handleShareGuestLink(m.id)}
                                        >
                                            <MemberAvatar member={m} isDark={isDark} allMembers={members} />
                                        </Pressable>
                                    ))}
                                </View>
                                {members.some((m) => m.isGuest) && (
                                    <Text style={[styles.guestHint, { color: colors.subText }]}>
                                        Long-press a guest member to share their balance link.
                                    </Text>
                                )}
                            </View>
                        );
                    }

                    if (section.title === 'summary') {
                        if (allSettled) {
                            return (
                                <View style={[styles.card, { backgroundColor: colors.card }]}>
                                    <Text style={[styles.allSettledText, { color: colors.settled }]}>
                                        All Settled! 🎉
                                    </Text>
                                </View>
                            );
                        }
                        if (settlements.length === 0) return null;
                        const preview = settlements.slice(0, 2);
                        return (
                            <View style={[styles.card, { backgroundColor: colors.card }]}>
                                <Text style={[styles.cardTitle, { color: colors.text }]}>Settlements</Text>
                                {preview.map((s, i) => (
                                    <Text key={i} style={[styles.settlementLine, { color: colors.subText }]}>
                                        {s.fromMemberName} → {s.toMemberName}: {formatRupees(s.amountMoney)}
                                    </Text>
                                ))}
                                <Pressable onPress={() => router.push(`/(trip)/${tripId}/settle`)}>
                                    <Text style={[styles.cardAction, { color: colors.accent, marginTop: 8 }]}>
                                        {settlements.length > 2
                                            ? `See all ${settlements.length} →`
                                            : 'Full settle plan →'}
                                    </Text>
                                </Pressable>
                            </View>
                        );
                    }

                    const expense = expenses.find((e) => e.id === item);
                    if (!expense) return null;
                    return (
                        <View style={{ marginBottom: 10 }}>
                            <ExpenseRow
                                expense={expense}
                                members={members}
                                isDark={isDark}
                                currentMemberId={myMember?.id}
                                onDelete={handleDeleteExpense}
                            />
                        </View>
                    );
                }}
                ListEmptyComponent={
                    !expensesLoading ? (
                        <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                            <Text style={[styles.emptyText, { color: colors.subText }]}>
                                No expenses yet. Add the first one!
                            </Text>
                        </View>
                    ) : null
                }
            />

            {/* Footer buttons */}
            <View style={[styles.footer, { borderTopColor: colors.separator, backgroundColor: colors.bg }]}>
                <Pressable
                    style={[styles.footerIconBtn, { backgroundColor: colors.card }]}
                    onPress={() => router.push(`/(trip)/${tripId}/qr`)}
                >
                    <Text style={styles.footerBtnIcon}>📤</Text>
                    <Text style={[styles.footerBtnLabel, { color: isDark ? '#ffffff' : '#000000' }]}>SHARE</Text>
                </Pressable>

                <Pressable
                    style={[styles.footerMainBtn, { backgroundColor: colors.accent }]}
                    onPress={() => router.push(`/(trip)/${tripId}/add-expense`)}
                >
                    <Text style={styles.footerMainBtnText}>Add Expense</Text>
                </Pressable>

                <Pressable
                    style={[styles.footerIconBtn, { backgroundColor: colors.card }]}
                    onPress={() => router.push(`/(trip)/${tripId}/settle`)}
                >
                    <Text style={styles.footerBtnIcon}>💵</Text>
                    <Text style={[styles.footerBtnLabel, { color: isDark ? '#ffffff' : '#000000' }]}>SETTLE</Text>
                </Pressable>
            </View>

            <Modal
                visible={addMemberVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setAddMemberVisible(false)}
            >
                <AddMemberModal
                    isDark={isDark}
                    onClose={() => setAddMemberVisible(false)}
                    onAdd={async (name) => {
                        await handleAddMember(name);
                        setAddMemberVisible(false);
                    }}
                />
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 28, fontWeight: '700' },
    headerSub: { fontSize: 14, marginTop: 2 },

    content: { padding: 16, gap: 12, paddingBottom: 24 },
    card: { borderRadius: 16, padding: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    cardTitle: { fontSize: 17, fontWeight: '600' },
    cardAction: { fontSize: 15, fontWeight: '500' },
    membersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    guestHint: { fontSize: 12, marginTop: 10 },
    settlementLine: { fontSize: 14, marginTop: 6 },
    expensesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 4 },
    shareListBtn: { fontSize: 13, fontWeight: '500' },
    allSettledText: { fontSize: 18, fontWeight: '700', textAlign: 'center', paddingVertical: 4 },
    sectionLabel: { fontSize: 13, fontWeight: '500', marginBottom: 8, marginTop: 4 },
    emptyCard: { borderRadius: 16, padding: 24, alignItems: 'center' },
    emptyText: { fontSize: 15, textAlign: 'center' },

    footer: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 48,
        borderTopWidth: StyleSheet.hairlineWidth,
        alignItems: 'stretch',
    },
    footerIconBtn: {
        width: 68,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        gap: 4,
    },
    footerBtnIcon: { fontSize: 20 },
    footerBtnLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    footerMainBtn: {
        flex: 1,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
    },
    footerMainBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const light = {
    bg: '#f2f2f7',
    headerBg: '#e8e8ed',
    text: '#000000',
    subText: '#6c6c70',
    card: '#ffffff',
    accent: '#007aff',
    separator: '#c6c6c8',
    settled: '#34c759',
};
const dark = {
    bg: '#000000',
    headerBg: '#1c1c1e',
    text: '#ffffff',
    subText: '#8e8e93',
    card: '#1c1c1e',
    accent: '#0a84ff',
    separator: '#38383a',
    settled: '#30d158',
};