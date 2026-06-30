/**
 * app/(tabs)/index.tsx — Dashboard (Home Tab)
 *
 * Layout (matching design mockup screen 2):
 *   1. Hero image (day/night) with floating header (menu + bell) and
 *      large greeting name — no balance amount on the hero itself.
 *   2. 3-stat card row overlapping hero bottom edge (owed / owe / total).
 *   3. Recent groups list (max 4) with "View all" link.
 *   4. Empty state when no groups (icon key, no emoji).
 *   5. (Removed) Quick-action row — now handled exclusively by the center FAB.
 *
 * Design delta fixes applied in this revision:
 *   - Hero now shows greeting + name (large), NOT the net balance number.
 *   - Floating header added: menu icon (left) + notification bell (right).
 *   - EmptyState now receives `iconKey` (not the dead `illustration` emoji prop).
 *   - All emoji replaced with <Icon /> calls from src/config/icons.ts.
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
import { Icon } from '../../components/ui/Icon';
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
        if (fetchError) {
            showToast({ message: 'Could not refresh. Pull down to retry.', variant: 'error' });
        }
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

    const heroSource = mode === 'dark' ? AppAssets.nightBg : AppAssets.dayBg;
    const recentTrips = trips.slice(0, MAX_RECENT);
    const displayName = deviceUser?.displayName ?? 'there';

    const handleTripPress = useCallback(async (tripId: string) => {
        await Haptics.selectionAsync();
        router.push(`/(trip)/${tripId}`);
    }, [router]);

    const handleCreate = useCallback(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCreateVisible(true);
    }, []);


    const handleProfile = useCallback(async () => {
        await Haptics.selectionAsync();
        router.push('/(tabs)/profile');
    }, [router]);

    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
            <ConnectionBanner />

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={refresh}
                        tintColor={colors.accent}
                        colors={[colors.accent]}
                    />
                }
                contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}
            >
                {/* ── Hero ──────────────────────────────────────────────── */}
                <View>
                    <ImageBackground
                        source={heroSource}
                        style={[styles.hero, { height: HERO_HEIGHT + insets.top }]}
                        resizeMode="cover"
                    >
                        <View style={styles.heroScrim} />

                        {/* Floating header — menu left, bell right */}
                        <SafeAreaView edges={['top']} style={styles.heroHeader}>
                            <Pressable
                                onPress={handleProfile}
                                hitSlop={12}
                                accessibilityLabel="Open menu"
                                accessibilityRole="button"
                                style={styles.heroHeaderBtn}
                            >
                                <Icon name="header.menu" size={24} color="#FFFFFF" />
                            </Pressable>

                            <Pressable
                                hitSlop={12}
                                accessibilityLabel="Notifications"
                                accessibilityRole="button"
                                style={styles.heroHeaderBtn}
                            >
                                <Icon name="header.notifications" size={24} color="#FFFFFF" />
                            </Pressable>
                        </SafeAreaView>

                        {/* Greeting — name large, as per design */}
                        <View style={styles.heroContent}>
                            <Text style={styles.heroWelcome}>Welcome back,</Text>
                            <Text style={styles.heroName} numberOfLines={1}>
                                {displayName}
                            </Text>
                        </View>
                    </ImageBackground>

                    {/* Stat cards overlap the hero bottom */}
                    <View style={[styles.statRow, { marginTop: -STAT_OVERLAP }]}>
                        <StatCard label="You are owed" paise={totalOwed} colorRole="owed" />
                        <StatCard label="You owe" paise={totalOwe} colorRole="owe" />
                        <StatCard label="Total spent" paise={totalSpent} colorRole="neutral" />
                    </View>
                </View>

                {/* ── Recent groups ──────────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={[typography.bodyMd, styles.sectionTitle, { color: colors.text }]}>
                            Recent Groups
                        </Text>
                        {trips.length > MAX_RECENT && (
                            <Pressable
                                onPress={() => router.push('/(tabs)/groups')}
                                hitSlop={8}
                                accessibilityRole="link"
                            >
                                <Text style={[typography.bodyMd, { color: colors.accent }]}>View all</Text>
                            </Pressable>
                        )}
                    </View>

                    {trips.length === 0 && !isLoading ? (
                        <EmptyState
                            iconKey="nav.groups"
                            title="No groups yet"
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


            </ScrollView>

            <Modal
                visible={createVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCreateVisible(false)}
            >
                <CreateTripModal
                    onClose={() => setCreateVisible(false)}
                    onCreated={(trip) => {
                        setCreateVisible(false);
                        router.push(`/(trip)/${trip.id}`);
                    }}
                />
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },

    // Hero
    hero: { width: '100%', justifyContent: 'flex-end' },
    heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.32)' },
    heroHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    heroHeaderBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: STAT_OVERLAP + spacing.xl,
    },
    heroWelcome: {
        ...typography.caption,
        color: 'rgba(255,255,255,0.80)',
        marginBottom: 4,
    },
    heroName: {
        fontSize: 32,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },

    // Stat row
    statRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
    },

    // Section
    section: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sectionTitle: { fontWeight: '600' },

    // List
    list: { gap: spacing.sm },


});