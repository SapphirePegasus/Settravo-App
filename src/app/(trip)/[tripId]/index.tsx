/**
 * app/(trip)/[tripId]/index.tsx
 *
 * Trip Detail screen — the main screen for a trip.
 *
 * Responsibilities:
 *  - Load and display trip metadata (name, destination)
 *  - Display members with avatar row; add guest members; share guest links
 *  - Display settlement summary card
 *  - Display expense list via ExpenseRow (swipe edit/delete)
 *  - Footer: Add Expense, QR Share, Settle Up
 *  - Header ⋯ menu: Share list, Edit Trip (creator), Leave Trip
 *
 * Architecture decisions:
 *  - useMembers() / useExpenses() pull from shared Zustand stores —
 *    no duplicate fetches when navigating between trip screens
 *  - handleDeleteExpense supports offline queue (Phase 0 fix)
 *  - useOfflineSync() is mounted in _layout.tsx, NOT here (Phase 0 fix)
 *  - isDark derived from useColorScheme() solely for child components
 *    (MemberAvatar, AddMemberModal) that have not yet migrated to
 *    useThemeColors(). Remove this once those components are migrated.
 */

import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    SectionList,
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
import { ConfirmModal } from '../../../components/modals/ConfirmModal';
import { EditTripModal } from '../../../components/trip/EditTripModal';
import { TripMenuSheet } from '../../../components/trip/TripMenuSheet';
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
import type { Trip } from '../../../types/domain';
import { formatRupees } from '../../../utils/money';
import { calculateSettlements } from '../../../utils/settlement';

// ─── Types ────────────────────────────────────────────────────────────────────

// SectionList requires typed sections
type SectionData =
    | { title: 'members'; data: ['members'] }
    | { title: 'summary'; data: ['summary'] }
    | { title: 'expenses'; data: string[] };   // expense IDs

// ─── Share text builder ───────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
    food: '🍽', transport: '🚗', stay: '🏨', misc: '📦',
};

function buildShareText(
    trip: Trip,
    expenses: { id: string; title: string; category: string | null; amountMoney: number; paidByMember: string }[],
    memberNameMap: Map<string, string>,
): string {
    const totalPaise = expenses.reduce((sum, e) => sum + e.amountMoney, 0);

    const lines: string[] = [
        `🧳 *${trip.name}${trip.destination ? ` — ${trip.destination}` : ''}*`,
        '',
        '📋 *Expense List*',
        '─────────────────',
    ];

    for (const expense of [...expenses].reverse()) {
        const emoji = expense.category ? (CATEGORY_EMOJI[expense.category] ?? '💳') : '💳';
        const payer = memberNameMap.get(expense.paidByMember) ?? '?';
        lines.push(`${emoji} ${expense.title} — ${formatRupees(expense.amountMoney)} _(paid by ${payer})_`);
    }

    lines.push('─────────────────');
    lines.push(`💰 *Total: ${formatRupees(totalPaise)}*`);
    lines.push('');
    lines.push('_(Shared via Settravo)_');

    return lines.join('\n');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const navigation = useNavigation();
    const colors = useThemeColors();
    const { showToast } = useToast();

    // isDark is kept only for child components (MemberAvatar, AddMemberModal)
    // that still accept isDark prop. Remove once those are migrated.
    const isDark = useColorScheme() === 'dark';

    // ── Store selectors ───────────────────────────────────────────────────────
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const splits = useExpenseStore((s) => s.splits);
    const removeExpenseFromStore = useExpenseStore((s) => s.removeExpense);
    const storeMember = useMemberStore((s) => s.addMember);
    const removeMemberFromStore = useMemberStore((s) => s.removeMember);
    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const enqueueOfflineItem = useTripStore((s) => s.enqueueOfflineItem);

    // ── Local state ───────────────────────────────────────────────────────────
    const [trip, setTrip] = useState<Trip | null>(null);
    const [tripLoading, setTripLoading] = useState(true);
    const [addMemberVisible, setAddMemberVisible] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [editTripVisible, setEditTripVisible] = useState(false);
    const [leaveVisible, setLeaveVisible] = useState(false);

    // ── Data hooks ────────────────────────────────────────────────────────────
    const members = useMembers(tripId ?? '');
    const { expenses, isLoading: expensesLoading, reconnectRealtime } = useExpenses(tripId ?? '');

    // ── Derived values ────────────────────────────────────────────────────────
    const myMember = useMemo(
        () => members.find((m) => m.deviceId === deviceUser?.id),
        [members, deviceUser?.id],
    );

    const isCreator = trip?.createdByDevice === deviceUser?.id;

    const memberNameMap = useMemo(
        () => new Map(members.map((m) => [m.id, m.displayName])),
        [members],
    );

    const allSplits = useMemo(
        () => Object.values(splits).flat(),
        [splits],
    );

    const settlements = useMemo(
        () => calculateSettlements(expenses, allSplits, members),
        [expenses, allSplits, members],
    );

    const allSettled = expenses.length > 0 && settlements.length === 0;

    const sections: SectionData[] = useMemo(() => [
        { title: 'members', data: ['members'] as ['members'] },
        { title: 'summary', data: ['summary'] as ['summary'] },
        { title: 'expenses', data: expenses.map((e) => e.id) },
    ], [expenses]);

    // ── Trip load ─────────────────────────────────────────────────────────────
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
            showToast({
                message: err instanceof Error ? err.message : 'Could not load trip.',
                variant: 'error',
            });
        } finally {
            setTripLoading(false);
        }
    }, [tripId, navigation, showToast]);

    // Set header right button once trip loads
    useEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Pressable
                    onPress={() => setMenuVisible(true)}
                    style={styles.headerMenuBtn}
                    accessibilityLabel="Trip options"
                    accessibilityRole="button"
                    hitSlop={8}
                >
                    <Text style={[styles.headerMenuIcon, { color: colors.accent }]}>⋯</Text>
                </Pressable>
            ),
        });
    }, [navigation, colors.accent]);

    useEffect(() => { loadTrip(); }, [loadTrip]);

    // ── Menu actions ──────────────────────────────────────────────────────────
    const menuActions = useMemo(() => [
        {
            label: 'Share expense list',
            icon: '📤',
            onPress: async () => {
                if (!trip || expenses.length === 0) {
                    showToast({ message: 'No expenses to share yet.', variant: 'info' });
                    return;
                }
                try {
                    await Share.share({ message: buildShareText(trip, expenses, memberNameMap) });
                } catch {
                    // User cancelled share sheet — not an error
                }
            },
        },
        ...(isCreator ? [{
            label: 'Edit trip',
            icon: '✏️',
            onPress: () => setEditTripVisible(true),
        }] : []),
        {
            label: 'Leave trip',
            icon: '🚪',
            variant: 'destructive' as const,
            onPress: () => setLeaveVisible(true),
        },
    ], [trip, expenses, memberNameMap, isCreator, showToast]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleDeleteExpense = useCallback(async (expenseId: string): Promise<void> => {
        if (!tripId) return;

        if (!networkOnline) {
            removeExpenseFromStore(tripId, expenseId);
            await enqueueOfflineItem({
                type: 'DELETE_EXPENSE',
                localId: Crypto.randomUUID(),
                retryCount: 0,
                lastFailedAt: null,
                payload: { expenseId, tripId },
            });
            showToast({ message: 'Delete queued — will sync when online', variant: 'info' });
            return;
        }

        try {
            await deleteExpense(expenseId);
            removeExpenseFromStore(tripId, expenseId);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            showToast({ message: 'Expense deleted', variant: 'info' });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : 'Could not delete expense.',
                variant: 'error',
            });
        }
    }, [tripId, networkOnline, removeExpenseFromStore, enqueueOfflineItem, showToast]);

    const handleEditExpense = useCallback((expenseId: string) => {
        router.push(`/(trip)/${tripId}/add-expense?expenseId=${expenseId}`);
    }, [tripId, router]);

    const handleAddMember = useCallback(async (name: string): Promise<void> => {
        if (!tripId) return;
        const newMember = await addGuestMember(tripId, name);
        storeMember(tripId, newMember);
    }, [tripId, storeMember]);

    const handleShareGuestLink = useCallback(async (memberId: string): Promise<void> => {
        const member = members.find((m) => m.id === memberId);
        if (!member) return;
        const url = buildGuestUrl(member);
        if (!url) {
            showToast({ message: `${member.displayName} already has the app.`, variant: 'info' });
            return;
        }
        try {
            await Share.share({
                message: `Hi ${member.displayName}! Check your trip balance here:\n${url}`,
                url,
            });
        } catch {
            // User cancelled
        }
    }, [members, showToast]);

    const handleLeaveTrip = useCallback(async (): Promise<void> => {
        if (!myMember || !tripId) return;
        try {
            await leaveTrip(myMember.id);
            removeMemberFromStore(tripId, myMember.id);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            showToast({ message: 'You have left the trip', variant: 'info' });
            router.replace('/');
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : 'Could not leave trip.',
                variant: 'error',
            });
        }
    }, [myMember, tripId, removeMemberFromStore, router, showToast]);

    // ── Section renderer ──────────────────────────────────────────────────────
    const renderItem = useCallback(({ item, section }: { item: string; section: SectionData }) => {
        // Members section
        if (section.title === 'members') {
            return (
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>
                            Members ({members.length})
                        </Text>
                        <Pressable
                            onPress={() => setAddMemberVisible(true)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Add member"
                        >
                            <Text style={[styles.cardAction, { color: colors.accent }]}>+ Add</Text>
                        </Pressable>
                    </View>

                    <View style={styles.membersRow}>
                        {members.map((m) => (
                            <Pressable
                                key={m.id}
                                onLongPress={() => {
                                    if (m.isGuest) void handleShareGuestLink(m.id);
                                }}
                                accessibilityLabel={
                                    m.isGuest
                                        ? `${m.displayName} (guest) — long press to share link`
                                        : m.displayName
                                }
                            >
                                <MemberAvatar
                                    member={m}
                                    isDark={isDark}
                                    allMembers={members}
                                />
                            </Pressable>
                        ))}
                    </View>

                    {members.some((m) => m.isGuest) && (
                        <Text style={[styles.guestHint, { color: colors.subText }]}>
                            Long-press a guest to share their balance link.
                        </Text>
                    )}
                </View>
            );
        }

        // Settlement summary section
        if (section.title === 'summary') {
            if (allSettled) {
                return (
                    <View style={[styles.card, { backgroundColor: colors.card }]}>
                        <Text style={[styles.allSettledText, { color: colors.accentSuccess }]}>
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
                    <Pressable
                        onPress={() => router.push(`/(trip)/${tripId}/settle`)}
                        hitSlop={8}
                    >
                        <Text style={[styles.cardAction, { color: colors.accent, marginTop: 8 }]}>
                            {settlements.length > 2
                                ? `See all ${settlements.length} →`
                                : 'Full settle plan →'}
                        </Text>
                    </Pressable>
                </View>
            );
        }

        // Expense row
        if (section.title === 'expenses') {
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
        }

        return null;
    }, [
        colors, members, isDark, allSettled, settlements, expenses,
        myMember, tripId, router,
        handleShareGuestLink, handleDeleteExpense, handleEditExpense,
    ]);

    const renderSectionHeader = useCallback(
        ({ section }: { section: SectionData }) => {
            if (section.title !== 'expenses' || expenses.length === 0) return null;
            return (
                <View style={styles.expensesHeader}>
                    <Text style={[styles.sectionLabel, { color: colors.subText }]}>
                        Expenses ({expenses.length})
                    </Text>
                </View>
            );
        },
        [expenses.length, colors.subText],
    );

    const ListEmptyComponent = useMemo(() => {
        if (expensesLoading) return null;
        return (
            <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.emptyText, { color: colors.subText }]}>
                    No expenses yet. Tap Add Expense to get started.
                </Text>
            </View>
        );
    }, [expensesLoading, colors.card, colors.subText]);

    // ── Loading state ─────────────────────────────────────────────────────────
    if (tripLoading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.accent} />
            </View>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
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
                // Prevent the list from stealing swipeable gesture events
                removeClippedSubviews={false}
            />

            {/* Footer */}
            <View style={[styles.footer, {
                borderTopColor: colors.separator,
                backgroundColor: colors.bg,
            }]}>
                <Pressable
                    style={[styles.footerIconBtn, { backgroundColor: colors.card }]}
                    onPress={() => router.push(`/(trip)/${tripId}/qr`)}
                    accessibilityRole="button"
                    accessibilityLabel="Share QR code"
                >
                    <Text style={styles.footerBtnIcon}>📤</Text>
                    <Text style={[styles.footerBtnLabel, { color: colors.text }]}>SHARE</Text>
                </Pressable>

                <Pressable
                    style={[styles.footerMainBtn, { backgroundColor: colors.accent }]}
                    onPress={() => router.push(`/(trip)/${tripId}/add-expense`)}
                    accessibilityRole="button"
                    accessibilityLabel="Add expense"
                >
                    <Text style={styles.footerMainBtnText}>Add Expense</Text>
                </Pressable>

                <Pressable
                    style={[styles.footerIconBtn, { backgroundColor: colors.card }]}
                    onPress={() => router.push(`/(trip)/${tripId}/settle`)}
                    accessibilityRole="button"
                    accessibilityLabel="Settle up"
                >
                    <Text style={styles.footerBtnIcon}>💵</Text>
                    <Text style={[styles.footerBtnLabel, { color: colors.text }]}>SETTLE</Text>
                </Pressable>
            </View>

            {/* Add Member modal */}
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

            {/* ⋯ menu */}
            <TripMenuSheet
                visible={menuVisible}
                onClose={() => setMenuVisible(false)}
                actions={menuActions}
            />

            {/* Edit trip modal — creator only */}
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

            {/* Leave trip confirmation */}
            <ConfirmModal
                visible={leaveVisible}
                title="Leave this trip?"
                message="You will lose access to all expenses and settlements. You can rejoin with the trip code."
                confirmLabel="Leave Trip"
                confirmVariant="destructive"
                onConfirm={handleLeaveTrip}
                onCancel={() => setLeaveVisible(false)}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    headerMenuBtn: { paddingHorizontal: 16, paddingVertical: 8 },
    headerMenuIcon: { fontSize: 24, fontWeight: '600' },

    content: { padding: 16, gap: 12, paddingBottom: 24 },

    card: { borderRadius: 16, padding: 16 },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: { fontSize: 17, fontWeight: '600' },
    cardAction: { fontSize: 15, fontWeight: '500' },

    membersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    guestHint: { fontSize: 12, marginTop: 10 },

    settlementLine: { fontSize: 14, marginTop: 6 },

    allSettledText: {
        fontSize: 18, fontWeight: '700',
        textAlign: 'center', paddingVertical: 4,
    },

    expensesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        marginTop: 4,
    },
    sectionLabel: { fontSize: 13, fontWeight: '500' },

    expenseRowWrapper: { marginBottom: 10 },

    emptyCard: { borderRadius: 16, padding: 24, alignItems: 'center' },
    emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

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