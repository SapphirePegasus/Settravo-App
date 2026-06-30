/**
 * app/(tabs)/index.tsx — Dashboard (Home Tab) — Phase D.2 Redesign
 *
 * Layout:
 *   1. Hero image (day/night) with greeting + net balance overlay
 *   2. 3-stat card row overlapping hero bottom edge
 *   3. Recent groups list (max 4) with "View all" link
 *   4. Empty state when no groups
 *   5. Quick-action row when groups exist
 */

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ImageBackground,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConnectionBanner } from '../../components/ConnectionBanner';
import { CreateTripModal } from '../../components/CreateTripModal';
import { TripCard } from '../../components/TripCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatCard } from '../../components/ui/StatCard';
import { useToast } from '../../components/Toast';
import { useThemeContext } from '@/context/ThemeContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTrips } from '../../hooks/useTrips';
import { useExpenseStore } from '../../stores/expenseStore';
import { useAuthStore } from '../../stores/authStore';
import { useTripStore } from '../../stores/tripStore';
import { AppAssets } from '@/theme/assets';
import { spacing, typography, radii } from '@/theme';

const HERO_HEIGHT = 240;
const STAT_OVERLAP = 20;
const MAX_RECENT = 4;

function getGreeting(name: string | null): string {
    const h = new Date().getHours();
    const base = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return name ? `${base}, ${name}` : base;
}

export default function DashboardScreen() {
    const router = useRouter();
    const colors = useThemeColors();
    const { mode } = useThemeContext();
    const { showToast } = useToast();
    const insets = useSafeAreaInsets();

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const offlineQueue = useTripStore((s) => s.offlineQueue);
    const allExpenses = useExpenseStore((s) => s.expenses);
    const allSplits = useExpenseStore((s) => s.splits);

    const { trips, isLoading, fetchError, refresh } = useTrips();
    const [createVisible, setCreateVisible] = useState(false);

    useEffect(() => {
        if (fetchError) showToast({ message: 'Could not refresh. Pull down to retry.', variant: 'error' });
    }, [fetchError, showToast]);

    const pendingSyncByTrip = useMemo(() => {
        const map: Record<string, number> = {};
        for (const item of offlineQueue) {
            const id =
                item.type === 'ADD_EXPENSE' ? item.payload.tripId :
                    item.type === 'DELETE_EXPENSE' ? item.payload.tripId :
                        item.type === 'EDIT_EXPENSE' ? (item.payload as { tripId?: string }).tripId ?? '' : '';
            if (id) map[id] = (map[id] ?? 0) + 1;
        }
        return map;
    }, [offlineQueue]);

    const { totalOwed, totalOwe, totalSpent } = useMemo(() => {
        let owed = 0, owe = 0, spent = 0;
        const flatSplits = Object.values(allSplits).flat();
        for (const expList of Object.values(allExpenses)) {
            for (const exp of expList) {
                spent += exp.amountMoney;
                const mySplit = flatSplits.find(
                    (sp) => sp.expenseId === exp.id && sp.memberId === deviceUser?.id,
                );
                if (mySplit && !mySplit.isSettled) {
                    if (exp.paidByMember === deviceUser?.id) owed += exp.amountMoney - mySplit.shareMoney;
                    else owe += mySplit.shareMoney;
                }
            }
        }
        return { totalOwed: owed, totalOwe: owe, totalSpent: spent };
    }, [allExpenses, allSplits, deviceUser?.id]);

    const netBalance = totalOwed - totalOwe;
    const heroSource = mode === 'dark' ? AppAssets.nightBg : AppAssets.dayBg;
    const recentTrips = trips.slice(0, MAX_RECENT);

    const handleTripPress = useCallback(async (tripId: string) => {
        await Haptics.selectionAsync();
        router.push(`/(trip)/${tripId}`);
    }, [router]);

    const handleCreate = useCallback(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCreateVisible(true);
    }, []);

    const handleJoin = useCallback(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/(trip)/join');
    }, [router]);

    const fmt = (p: number) => `₹${(Math.abs(p) / 100).toFixed(0)}`;

    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
            <ConnectionBanner />

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={refresh}
                        tintColor={colors.accent} colors={[colors.accent]} />
                }
                contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}
            >
                {/* ── Hero ───────────────────────────────────────────── */}
                <View>
                    <ImageBackground
                        source={heroSource}
                        style={[styles.hero, { height: HERO_HEIGHT + insets.top }]}
                        resizeMode="cover"
                    >
                        <View style={styles.heroScrim} />
                        <SafeAreaView edges={['top']} style={styles.heroContent}>
                            <Text style={styles.heroGreeting}>
                                {getGreeting(deviceUser?.displayName ?? null)} 👋
                            </Text>
                            <Text style={styles.heroBalance}>
                                {netBalance >= 0 ? `+${fmt(netBalance)}` : `-${fmt(netBalance)}`}
                            </Text>
                            <Text style={styles.heroLabel}>
                                {netBalance >= 0 ? 'You are owed' : 'You owe'}
                            </Text>
                        </SafeAreaView>
                    </ImageBackground>

                    {/* Stat cards overlap the hero bottom */}
                    <View style={[styles.statRow, { marginTop: -STAT_OVERLAP }]}>
                        <StatCard label="Owed to you" paise={totalOwed} colorRole="owed" />
                        <StatCard label="You owe" paise={totalOwe} colorRole="owe" />
                        <StatCard label="Total spent" paise={totalSpent} colorRole="neutral" />
                    </View>
                </View>

                {/* ── Recent groups ───────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={[typography.bodyMd, { color: colors.text }]}>Recent Groups</Text>
                        {trips.length > MAX_RECENT && (
                            <Pressable onPress={() => router.push('/(tabs)/groups')} hitSlop={8}>
                                <Text style={[typography.bodyMd, { color: colors.accent }]}>View all</Text>
                            </Pressable>
                        )}
                    </View>

                    {trips.length === 0 && !isLoading ? (
                        <EmptyState
                            illustration="🏕️"
                            title="No trips yet"
                            subtitle="Create your first group to start splitting expenses."
                            actionLabel="Create Group"
                            onAction={handleCreate}
                        />
                    ) : (
                        <View style={styles.list}>
                            {recentTrips.map((t) => (
                                <TripCard
                                    key={t.id}
                                    trip={t}
                                    pendingSyncCount={pendingSyncByTrip[t.id] ?? 0}
                                    onPress={() => handleTripPress(t.id)}
                                />
                            ))}
                        </View>
                    )}
                </View>

                {/* ── Quick actions ────────────────────────────────────── */}
                {trips.length > 0 && (
                    <View style={[styles.actions, { borderTopColor: colors.separator }]}>
                        <Pressable
                            style={[styles.actionBtn, { backgroundColor: colors.subSurface, borderColor: colors.cardBorder }]}
                            onPress={handleJoin}
                        >
                            <Text style={[typography.bodyMd, { color: colors.text }]}>Join Group</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.actionBtn, { backgroundColor: colors.accent, borderColor: 'transparent' }]}
                            onPress={handleCreate}
                        >
                            <Text style={[typography.bodyMd, { color: colors.textInverse }]}>+ Create</Text>
                        </Pressable>
                    </View>
                )}
            </ScrollView>

            <Modal visible={createVisible} animationType="slide" presentationStyle="pageSheet"
                onRequestClose={() => setCreateVisible(false)}>
                <CreateTripModal
                    onClose={() => setCreateVisible(false)}
                    onCreated={(trip) => { setCreateVisible(false); router.push(`/(trip)/${trip.id}`); }}
                />
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    hero: { width: '100%', justifyContent: 'flex-end' },
    heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.30)' },
    heroContent: { paddingHorizontal: spacing.lg, paddingBottom: STAT_OVERLAP + spacing.xl },
    heroGreeting: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginBottom: spacing.xs },
    heroBalance: { fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1, fontVariant: ['tabular-nums'] },
    heroLabel: { ...typography.caption, color: 'rgba(255,255,255,0.70)', marginTop: 2 },
    statRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
    section: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    list: { gap: spacing.sm },
    actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.lg, marginTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
    actionBtn: { flex: 1, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});