/**
 * app/(trip)/[tripId]/index.tsx — Trip Detail Screen
 *
 * All emoji replaced with <Icon /> components.
 * TripMenuSheet.Action.icon (string) → .iconKey (IconKey) — breaking change
 * applied here at the call site.
 * Footer icon buttons use Icon + label text.
 * Header ⋯ button uses Icon.
 * buildShareText() preserves emoji in the *shared text string* intentionally
 * (emojis in WhatsApp/SMS messages are expected and correct there).
 */

import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    SectionList,
    Share,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddMemberModal } from '../../../components/AddMemberModal';
import { ConnectionBanner } from '../../../components/ConnectionBanner';
import { ExpenseRow } from '../../../components/ExpenseRow';
import { ConfirmModal } from '../../../components/modals/ConfirmModal';
import { EditTripModal } from '../../../components/trip/EditTripModal';
import { TripMenuSheet } from '../../../components/trip/TripMenuSheet';
import type { TripMenuAction } from '../../../components/trip/TripMenuSheet';
import { ExpenseDateSection } from '../../../components/trip/ExpenseDateSection';
import { TripSummaryCard } from '../../../components/trip/TripSummaryCard';
import { Avatar } from '../../../components/ui/Avatar';
import { Icon } from '../../../components/ui/Icon';
import { useToast } from '../../../components/Toast';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useExpenses } from '../../../hooks/useExpenses';
import { useMembers } from '../../../hooks/useMembers';
import { deleteExpense } from '../../../services/expenseService';
import { buildGuestUrl, leaveTrip } from '../../../services/memberService';
import { addGuestMember, getTrip } from '../../../services/tripService';
import { useAuthStore } from '../../../stores/authStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useExpenseStore } from '../../../stores/expenseStore';
import { useMemberStore } from '../../../stores/memberStore';
import { useTripStore } from '../../../stores/tripStore';
import type { Member, Trip } from '../../../types/domain';
import { formatRupees } from '../../../utils/money';
import { calculateSettlements } from '../../../utils/settlement';
import { spacing, typography, radii } from '@/theme';

// ─── Share text (emoji here is intentional — sent to messaging apps) ──────────

function buildShareText(
    trip: Trip,
    expenses: { title: string; category: string | null; amountMoney: number; paidByMember: string }[],
    memberNameMap: Map<string, string>,
): string {
    const totalPaise = expenses.reduce((sum, e) => sum + e.amountMoney, 0);
    const CATEGORY_EMOJI: Record<string, string> = { food: '🍽', transport: '🚗', stay: '🏨', misc: '📦' };
    const lines = [
        `🧳 *${trip.name}${trip.destination ? ` — ${trip.destination}` : ''}*`,
        '',
        '📋 *Expense List*',
        '─────────────────',
        ...[...expenses].reverse().map((e) => {
            const emoji = e.category ? (CATEGORY_EMOJI[e.category] ?? '💳') : '💳';
            const payer = memberNameMap.get(e.paidByMember) ?? '?';
            return `${emoji} ${e.title} — ${formatRupees(e.amountMoney)} _(paid by ${payer})_`;
        }),
        '─────────────────',
        `💰 *Total: ${formatRupees(totalPaise)}*`,
        '',
        '_(Shared via Settravo)_',
    ];
    return lines.join('\n');
}

function groupExpensesByDate(
    expenses: { id: string; createdAt: string }[],
): { dateKey: string; data: string[] }[] {
    const map = new Map<string, string[]>();
    const sorted = [...expenses].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    for (const exp of sorted) {
        const key = exp.createdAt.slice(0, 10);
        const group = map.get(key) ?? [];
        group.push(exp.id);
        map.set(key, group);
    }
    return Array.from(map.entries()).map(([dateKey, data]) => ({ dateKey, data }));
}

// ─── Sub-component: Members section ──────────────────────────────────────────

interface MembersSectionProps {
    members: Member[];
    onAddMember: () => void;
    onShareGuestLink: (memberId: string) => void;
}

function MembersSection({ members, onAddMember, onShareGuestLink }: MembersSectionProps) {
    const colors = useThemeColors();
    return (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
                <Text style={[typography.bodyMd, { color: colors.text }]}>
                    Members ({members.length})
                </Text>
                <Pressable
                    onPress={onAddMember}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Add member"
                    style={styles.addMemberBtn}
                >
                    <Icon name="action.add" size={16} color={colors.accent} />
                    <Text style={[typography.bodyMd, { color: colors.accent }]}>Add</Text>
                </Pressable>
            </View>
            <View style={styles.membersRow}>
                {members.map((m) => (
                    <Pressable
                        key={m.id}
                        onLongPress={() => { if (m.isGuest) onShareGuestLink(m.id); }}
                        accessibilityLabel={
                            m.isGuest
                                ? `${m.displayName} (guest) — long press to share link`
                                : m.displayName
                        }
                    >
                        <Avatar name={m.displayName} size="md" />
                    </Pressable>
                ))}
            </View>
            {members.some((m) => m.isGuest) && (
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                    Long-press a guest to share their balance link.
                </Text>
            )}
        </View>
    );
}

// ─── Section list types ───────────────────────────────────────────────────────

type SectionData =
    | { title: 'members'; data: ['members'] }
    | { title: 'summary'; data: ['summary'] }
    | { title: string; data: string[]; dateKey: string };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const navigation = useNavigation();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const splits = useExpenseStore((s) => s.splits);
    const removeExpenseFromStore = useExpenseStore((s) => s.removeExpense);
    const storeMember = useMemberStore((s) => s.addMember);
    const removeMemberFromStore = useMemberStore((s) => s.removeMember);
    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const enqueueOfflineItem = useTripStore((s) => s.enqueueOfflineItem);

    const [trip, setTrip] = useState<Trip | null>(null);
    const [tripLoading, setTripLoading] = useState(true);
    const [addMemberVisible, setAddMemberVisible] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [editTripVisible, setEditTripVisible] = useState(false);
    const [leaveVisible, setLeaveVisible] = useState(false);

    const members = useMembers(tripId ?? '');
    const { expenses, isLoading: expensesLoading, reconnectRealtime } = useExpenses(tripId ?? '');

    const myMember = useMemo(
        () => members.find((m) => m.deviceId === deviceUser?.id),
        [members, deviceUser?.id],
    );

    const isCreator = trip?.createdByDevice === deviceUser?.id;

    const memberNameMap = useMemo(
        () => new Map(members.map((m) => [m.id, m.displayName])),
        [members],
    );

    const allSplits = useMemo(() => Object.values(splits).flat(), [splits]);

    const settlements = useMemo(
        () => calculateSettlements(expenses, allSplits, members),
        [expenses, allSplits, members],
    );

    const allSettled = expenses.length > 0 && settlements.length === 0;

    const sections: SectionData[] = useMemo(() => [
        { title: 'members', data: ['members'] as ['members'] },
        { title: 'summary', data: ['summary'] as ['summary'] },
        ...groupExpensesByDate(expenses).map((g) => ({
            title: g.dateKey, data: g.data, dateKey: g.dateKey,
        })),
    ], [expenses]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const loadTrip = useCallback(async () => {
        if (!tripId) return;
        setTripLoading(true);
        try {
            const fetched = await getTrip(tripId);
            if (fetched) {
                setTrip(fetched);
                navigation.setOptions({ title: fetched.name });
            }
        } catch (err) {
            showToast({ message: err instanceof Error ? err.message : 'Could not load trip.', variant: 'error' });
        } finally {
            setTripLoading(false);
        }
    }, [tripId, showToast]);

    useEffect(() => { loadTrip(); }, [loadTrip]);

    // Menu actions — use IconKey instead of emoji strings
    const menuActions = useMemo((): TripMenuAction[] => {
        const actions: TripMenuAction[] = [];
        actions.push({
            label: 'Share Expense List',
            iconKey: 'action.share',
            variant: 'default',
            onPress: async () => {
                setMenuVisible(false);
                if (!trip) return;
                const text = buildShareText(trip, expenses, memberNameMap);
                await Share.share({ message: text });
            },
        });
        if (isCreator) {
            actions.push({
                label: 'Edit Trip',
                iconKey: 'action.edit',
                variant: 'default',
                onPress: () => { setMenuVisible(false); setEditTripVisible(true); },
            });
        }
        if (!isCreator || members.length === 1) {
            actions.push({
                label: 'Leave Trip',
                iconKey: 'action.leave',
                variant: 'destructive',
                onPress: () => { setMenuVisible(false); setLeaveVisible(true); },
            });
        }
        return actions;
    }, [trip, expenses, memberNameMap, isCreator, members.length]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Pressable
                    style={styles.headerMenuBtn}
                    onPress={() => setMenuVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Trip menu"
                >
                    <Icon name="header.more" size={24} color={colors.text} />
                </Pressable>
            ),
        });
    }, [colors.text]);

    const handleAddMember = useCallback(async (name: string) => {
        if (!tripId) return;
        try {
            const member = await addGuestMember(tripId, name);
            storeMember(tripId, member);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast({ message: `${name} added`, variant: 'success' });
        } catch (err) {
            showToast({ message: err instanceof Error ? err.message : 'Could not add member.', variant: 'error' });
        }
    }, [tripId, storeMember, showToast]);

    const handleShareGuestLink = useCallback(async (memberId: string) => {
        const member = members.find((m) => m.id === memberId);
        if (!member) return;
        try {
            const url = buildGuestUrl(member);
            if (!url) return;
            await Share.share({ message: `Hi ${member.displayName}! Check your balance:\n${url}`, url });
        } catch { /* user cancelled */ }
    }, [members]);

    const handleDeleteExpense = useCallback(async (expenseId: string) => {
        if (!tripId) return;
        removeExpenseFromStore(tripId, expenseId);
        if (!networkOnline) {
            await enqueueOfflineItem({
                type: 'DELETE_EXPENSE',
                localId: Crypto.randomUUID(),
                retryCount: 0,
                lastFailedAt: null,
                payload: { expenseId, tripId },
            });
            showToast({ message: 'Expense deleted (will sync when online)', variant: 'info' });
            return;
        }
        try {
            await deleteExpense(expenseId);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            showToast({ message: 'Expense deleted', variant: 'success' });
        } catch (err) {
            showToast({ message: err instanceof Error ? err.message : 'Could not delete expense.', variant: 'error' });
        }
    }, [tripId, networkOnline, removeExpenseFromStore, enqueueOfflineItem, showToast]);

    const handleEditExpense = useCallback((expenseId: string) => {
        router.push(`/(trip)/${tripId}/add-expense?expenseId=${expenseId}`);
    }, [router, tripId]);

    const handleLeaveTrip = useCallback(async () => {
        if (!myMember || !tripId) return;
        try {
            await leaveTrip(myMember.id);
            removeMemberFromStore(tripId, myMember.id);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            showToast({ message: 'You have left the trip', variant: 'info' });
            router.replace('/(tabs)');
        } catch (err) {
            showToast({ message: err instanceof Error ? err.message : 'Could not leave trip.', variant: 'error' });
        }
    }, [myMember, tripId, removeMemberFromStore, router, showToast]);

    const renderItem = useCallback(
        ({ item, section }: { item: string; section: SectionData }) => {
            if (section.title === 'members') {
                return (
                    <MembersSection
                        members={members}
                        onAddMember={() => setAddMemberVisible(true)}
                        onShareGuestLink={handleShareGuestLink}
                    />
                );
            }
            if (section.title === 'summary') {
                return (
                    <TripSummaryCard
                        expenses={expenses}
                        settlements={settlements}
                        allSettled={allSettled}
                        onSettlePress={() => router.push(`/(trip)/${tripId}/settle`)}
                    />
                );
            }
            const expense = expenses.find((e) => e.id === item);
            if (!expense) return null;
            return (
                <View style={styles.expenseRowWrapper}>
                    <ExpenseRow
                        expense={expense}
                        members={members}
                        currentMemberId={myMember?.id}
                        onDelete={handleDeleteExpense}
                        onEdit={handleEditExpense}
                    />
                </View>
            );
        },
        [members, expenses, settlements, allSettled, myMember, tripId, router,
            handleShareGuestLink, handleDeleteExpense, handleEditExpense],
    );

    const renderSectionHeader = useCallback(
        ({ section }: { section: SectionData }) => {
            if (section.title === 'members' || section.title === 'summary') return null;
            return <ExpenseDateSection dateKey={(section as { dateKey: string }).dateKey} />;
        },
        [],
    );

    const ListEmptyComponent = useMemo(() => {
        if (expensesLoading) return null;
        return (
            <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                    No expenses yet. Tap Add Expense to get started.
                </Text>
            </View>
        );
    }, [expensesLoading, colors.card, colors.textSecondary]);

    if (tripLoading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.accent} />
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
            <ConnectionBanner onReconnect={reconnectRealtime} />

            <SectionList<string, SectionData>
                sections={sections}
                keyExtractor={(item) => item}
                contentContainerStyle={styles.content}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                renderSectionHeader={renderSectionHeader}
                renderItem={renderItem}
                ListEmptyComponent={ListEmptyComponent}
                removeClippedSubviews={false}
            />

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: colors.separator, backgroundColor: colors.bg }]}>
                <Pressable
                    style={[styles.footerIconBtn, { backgroundColor: colors.card }]}
                    onPress={() => router.push(`/(trip)/${tripId}/qr`)}
                    accessibilityRole="button"
                    accessibilityLabel="Share QR code"
                >
                    <Icon name="action.qrCode" size={20} color={colors.icon} />
                    <Text style={[styles.footerBtnLabel, { color: colors.text }]}>SHARE</Text>
                </Pressable>

                <Pressable
                    style={[styles.footerMainBtn, { backgroundColor: colors.accent }]}
                    onPress={() => router.push(`/(trip)/${tripId}/add-expense`)}
                    accessibilityRole="button"
                    accessibilityLabel="Add expense"
                >
                    <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '600' }]}>
                        Add Expense
                    </Text>
                </Pressable>

                <Pressable
                    style={[styles.footerIconBtn, { backgroundColor: colors.card }]}
                    onPress={() => router.push(`/(trip)/${tripId}/settle`)}
                    accessibilityRole="button"
                    accessibilityLabel="Settle up"
                >
                    <Icon name="money.settle" size={20} color={colors.icon} />
                    <Text style={[styles.footerBtnLabel, { color: colors.text }]}>SETTLE</Text>
                </Pressable>
            </View>

            <Modal visible={addMemberVisible} animationType="slide" presentationStyle="pageSheet"
                onRequestClose={() => setAddMemberVisible(false)}>
                <AddMemberModal
                    onClose={() => setAddMemberVisible(false)}
                    onAdd={async (name) => { await handleAddMember(name); setAddMemberVisible(false); }}
                />
            </Modal>

            <TripMenuSheet
                visible={menuVisible}
                onClose={() => setMenuVisible(false)}
                actions={menuActions}
            />

            {trip && (
                <EditTripModal
                    visible={editTripVisible}
                    trip={trip}
                    onClose={() => setEditTripVisible(false)}
                    onUpdated={(updated) => {
                        setTrip(updated);
                        navigation.setOptions({ title: updated.name });
                    }}
                />
            )}

            <ConfirmModal
                visible={leaveVisible}
                title="Leave this trip?"
                message="You will lose access to all expenses and settlements. You can rejoin with the trip code."
                confirmLabel="Leave Trip"
                confirmVariant="destructive"
                onConfirm={handleLeaveTrip}
                onCancel={() => setLeaveVisible(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerMenuBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    card: { borderRadius: radii.lg, padding: spacing.md },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    membersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    expenseRowWrapper: { marginBottom: spacing.sm },
    emptyCard: { borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center' },
    footer: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xl,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerIconBtn: {
        width: 68,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
        gap: 4,
    },
    footerBtnLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    footerMainBtn: {
        flex: 1,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
    },
});