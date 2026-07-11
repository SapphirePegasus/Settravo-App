/**
 * app/(trip)/[tripId]/index.tsx — Trip Detail Screen
 *
 * Design parity fixes applied in this revision:
 *   - Custom header rendered (back arrow + trip name + ⋯ menu) since
 *     the Stack header is hidden (headerShown: false in _layout.tsx).
 *   - Cover image hero section at the top when trip.coverImageUrl is set;
 *     falls back to an accent-tinted tile with trip initials.
 *   - Members section re-styled to match design mockup (avatar row + name chips).
 *   - Footer (SHARE | Add Expense | SETTLE) preserved.
 *   - buildShareText() keeps emoji intentionally — sent to WhatsApp/SMS.
 */

import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

const COVER_HEIGHT = 200;

// ─── Share text (emoji intentional — sent to messaging apps) ──────────────────

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

// ─── Members section ──────────────────────────────────────────────────────────

interface MembersSectionProps {
    members: Member[];
    onAddMember: () => void;
    onShareGuestLink: (memberId: string) => void;
}

function MembersSection({ members, onAddMember, onShareGuestLink }: MembersSectionProps) {
    const colors = useThemeColors();
    const [memberMenuTarget, setMemberMenuTarget] = useState<Member | null>(null);

    return (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.cardHeader}>
                <Text style={[typography.label, { color: colors.textSecondary }]}>
                    MEMBERS · {members.length}
                </Text>
                <Pressable
                    onPress={onAddMember}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Add member"
                    style={styles.addMemberBtn}
                >
                    <Icon name="action.add" size={14} color={colors.accent} />
                    <Text style={[typography.caption, { color: colors.accent, fontWeight: '600' }]}>
                        ADD MEMBER
                    </Text>
                </Pressable>
            </View>

            {/* Scrollable avatar row */}
            <View style={styles.avatarRow}>
                {members.map((m) => (
                    <Pressable
                        key={m.id}
                        style={styles.memberChip}
                        //onPress={() => setMemberMenuTarget(m)}
                        onPress={() => { if (m.isGuest) onShareGuestLink(m.id); }}
                        accessibilityLabel={m.displayName}
                    >
                        <Avatar name={m.displayName} size="md" />
                        <Text
                            style={[typography.label, { color: colors.textSecondary, marginTop: 4 }]}
                            numberOfLines={1}
                        >
                            {m.displayName.split(' ')[0]}
                        </Text>
                        {m.isGuest && (
                            <View style={[styles.guestDot, { backgroundColor: colors.warning }]} />
                        )}
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

// ─── Section list types ───────────────────────────────────────────────────────

type SectionData =
    | { title: 'cover'; data: ['cover'] }
    | { title: 'members'; data: ['members'] }
    | { title: 'summary'; data: ['summary'] }
    | { title: string; data: string[]; dateKey: string };


// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TripDetailScreen() {

    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
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
        { title: 'cover', data: ['cover'] as ['cover'] },
        { title: 'members', data: ['members'] as ['members'] },
        { title: 'summary', data: ['summary'] as ['summary'] },
        ...groupExpensesByDate(expenses).map((g) => ({
            title: g.dateKey, data: g.data, dateKey: g.dateKey,
        })),
    ], [expenses]);

    const loadTrip = useCallback(async () => {
        if (!tripId) return;
        setTripLoading(true);
        try {
            const fetched = await getTrip(tripId);
            if (fetched) setTrip(fetched);
        } catch (err) {
            showToast({ message: err instanceof Error ? err.message : 'Could not load trip.', variant: 'error' });
        } finally {
            setTripLoading(false);
        }
    }, [tripId, showToast]);

    useEffect(() => { loadTrip(); }, [loadTrip]);

    const menuActions = useMemo((): TripMenuAction[] => {
        const actions: TripMenuAction[] = [];
        actions.push({
            label: 'Share Expense List',
            iconKey: 'action.share',
            variant: 'default',
            onPress: async () => {
                if (!trip) return;
                const text = buildShareText(trip, expenses, memberNameMap);
                await Share.share({ message: text });
            },
        });
        /*if (isCreator) {
            actions.push({
                label: 'Edit Trip',
                iconKey: 'action.edit',
                variant: 'default',
                onPress: () => setEditTripVisible(true),
            });
        }*/
        if (!isCreator || members.length === 1) {
            actions.push({
                label: 'Leave Trip',
                iconKey: 'action.leave',
                variant: 'destructive',
                onPress: () => setLeaveVisible(true),
            });
        }
        return actions;
    }, [trip, expenses, memberNameMap, isCreator, members.length]);

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
            if (section.title === 'cover') {
                return trip ? <CoverHero trip={trip} /> : null;
            }
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
                <ExpenseRow
                    expense={expense}
                    members={members}
                    currentMemberId={myMember?.id}
                    onDelete={handleDeleteExpense}
                    onEdit={handleEditExpense}
                />
            );
        },
        [trip, members, expenses, settlements, allSettled, myMember, tripId, router,
            handleShareGuestLink, handleDeleteExpense, handleEditExpense],
    );

    const renderSectionHeader = useCallback(
        ({ section }: { section: SectionData }) => {
            if (['cover', 'members', 'summary'].includes(section.title)) return null;
            return <ExpenseDateSection dateKey={(section as { dateKey: string }).dateKey} />;
        },
        [],
    );

    if (tripLoading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.accent} />
            </View>
        );
    }

    // ─── Cover hero ───────────────────────────────────────────────────────────────

    interface CoverHeroProps {
        trip: Trip;
    }

    function CoverHero({ trip }: CoverHeroProps) {
        const colors = useThemeColors();
        const [imageError, setImageError] = useState(false);

        const initials = trip.name.slice(0, 2).toUpperCase();
        const showImage = Boolean(trip.coverImageUrl) && !imageError;

        return (
            <View style={styles.heroWrapper}>
                {/* Cover image */}
                {showImage ? (
                    <Image
                        source={{ uri: trip.coverImageUrl! }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={200}
                    />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={[typography.display, { color: colors.accent }]}>{initials}</Text>
                    </View>
                )}

                {/* Floating back + menu — absolute at top */}
                <SafeAreaView edges={['top']} style={styles.heroNav} pointerEvents="box-none">
                    <Pressable
                        style={styles.heroNavBtn}
                        onPress={() => router.back()}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Icon name="header.back" size={24} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                        style={styles.heroNavBtn}
                        onPress={() => setMenuVisible(true)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="More options"
                    >
                        <Icon name="header.more" size={24} color="#FFFFFF" />
                    </Pressable>
                </SafeAreaView>

                {/* Name + description — bottom-left, mirroring home hero */}
                <View style={styles.heroTextPin}>
                    {/* Group name — show FULL, no truncation */}
                    <Text style={styles.heroGroupName}>{trip.name}</Text>
                    {/* Description — ellipsis, max 2 lines */}
                    {trip.destination ? (
                        <Text style={styles.heroGroupDesc} numberOfLines={2} ellipsizeMode="tail">
                            {trip.destination}
                        </Text>
                    ) : null}
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>

            <ConnectionBanner onReconnect={reconnectRealtime} />

            <SectionList<string, SectionData>
                sections={sections}
                keyExtractor={(item) => item}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                renderSectionHeader={renderSectionHeader}
                renderItem={renderItem}
                ListEmptyComponent={
                    expensesLoading ? null : (
                        <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                                No expenses yet. Tap Add Expense to get started.
                            </Text>
                        </View>
                    )
                }
                removeClippedSubviews={false}
            />

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <SafeAreaView
                edges={['bottom']}
                style={[styles.footer, { borderTopColor: colors.separator, backgroundColor: colors.surface }]}
            >
                <Pressable
                    style={[styles.footerIconBtn, { backgroundColor: colors.card }]}
                    onPress={() => router.push(`/(trip)/${tripId}/qr`)}
                    accessibilityRole="button"
                    accessibilityLabel="Share QR code"
                >
                    <Icon name="action.qrCode" size={20} color={colors.icon} />
                    <Text style={[styles.footerBtnLabel, { color: colors.textSecondary }]}>SHARE</Text>
                </Pressable>

                <Pressable
                    style={[styles.footerMainBtn, { backgroundColor: colors.accent }]}
                    onPress={() => router.push(`/(trip)/${tripId}/add-expense`)}
                    accessibilityRole="button"
                    accessibilityLabel="Add expense"
                >
                    <Icon name="action.add" size={18} color={colors.textInverse} />
                    <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '700' }]}>
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
                    <Text style={[styles.footerBtnLabel, { color: colors.textSecondary }]}>SETTLE</Text>
                </Pressable>
            </SafeAreaView>

            {/* ── Modals ─────────────────────────────────────────────────── */}
            <Modal
                visible={addMemberVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setAddMemberVisible(false)}
            >
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
                    onUpdated={(updated) => setTrip(updated)}
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
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // Header
    heroWrapper: {
        width: '100%',
        height: 220,   // same as dashboard hero height
        overflow: 'hidden',
    },
    heroNav: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.xs,
    },
    heroNavBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.28)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTextPin: {
        position: 'absolute',
        bottom: spacing.md,
        left: spacing.md,
        right: spacing.md,
    },
    heroGroupName: {
        ...typography.title,
        color: '#FFFFFF',
        // NO numberOfLines limit — show full name
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 4,
    },
    heroGroupDesc: {
        ...typography.body,
        color: 'rgba(255,255,255,0.80)',
        marginTop: 2,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },

    // Cover hero
    coverContainer: {
        height: COVER_HEIGHT,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    coverInitials: {
        fontSize: 56,
        fontWeight: '800',
        letterSpacing: -1,
    },
    coverScrim: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 0,
        backgroundColor: 'rgba(0,0,0,0)',
    },

    // Members
    card: {
        borderRadius: radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.md,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    memberChip: { alignItems: 'center', width: 52, position: 'relative' },
    guestDot: {
        position: 'absolute',
        top: 0,
        right: 6,
        width: 8,
        height: 8,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },

    // List
    content: { gap: spacing.sm },
    emptyCard: { borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', margin: spacing.md },

    // Footer
    footer: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        padding: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerIconBtn: {
        flex: 1,
        maxWidth: 80,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
        gap: 3,
    },
    footerBtnLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
    footerMainBtn: {
        flex: 2,
        flexDirection: 'row',
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
        gap: spacing.xs,
    },
});