/**
 * app/(tabs)/index.tsx — Dashboard (Home Tab)
 *
 * Layout (matching design mockup screen 2):
 *   1. Hero image with floating header (hamburger left — opens MenuDrawer).
 *      Bell removed per product decision.
 *   2. 3-stat card row overlapping hero bottom edge.
 *   3. Recent groups list (max 4) with "View all" link.
 *   4. Empty state when no groups.
 *
 * HEADER POSITION FIX:
 *   The heroHeader was previously a regular flex child inside a
 *   `justifyContent: 'flex-end'` container, so it rendered near the
 *   bottom of the hero rather than at the top. Fixed by using
 *   `position: 'absolute'` on the header, detaching it from the flex
 *   stack so it sits at top: 0 regardless of the parent's flex direction.
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
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConnectionBanner } from '../../components/ConnectionBanner';
import { CreateTripModal } from '../../components/CreateTripModal';
import { MenuDrawer } from '../../components/MenuDrawer';
import { TripCard } from '../../components/TripCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatCard } from '../../components/ui/StatCard';
import { Icon } from '../../components/ui/Icon';
import { SkeletonTripCard } from '../../components/ui/Skeleton';
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
    const [menuDrawerVisible, setMenuDrawerVisible] = useState(false);

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

    // ── Entrance animations ──────────────────────────────────────────────────
    // Stat row slides up + fades in 280ms after mount.
    // Recent groups section follows 100ms later to create a staggered feel.
    // Using withTiming (not spring) to match the rest of the sheet-style
    // transitions used elsewhere; spring here would feel bouncy on a data list.
    const statOpacity = useSharedValue(0);
    const statTranslateY = useSharedValue(16);
    const listOpacity = useSharedValue(0);
    const listTranslateY = useSharedValue(20);

    useEffect(() => {
        statOpacity.value = withDelay(120, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
        statTranslateY.value = withDelay(120, withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }));
        listOpacity.value = withDelay(220, withTiming(1, { duration: 320, easing: Easing.out(Easing.ease) }));
        listTranslateY.value = withDelay(220, withTiming(0, { duration: 320, easing: Easing.out(Easing.ease) }));
        // Run once on mount — empty deps is intentional here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const statAnimStyle = useAnimatedStyle(() => ({
        opacity: statOpacity.value,
        transform: [{ translateY: statTranslateY.value }],
    }));
    const listAnimStyle = useAnimatedStyle(() => ({
        opacity: listOpacity.value,
        transform: [{ translateY: listTranslateY.value }],
    }));

    const handleTripPress = useCallback(async (tripId: string) => {
        await Haptics.selectionAsync();
        router.push(`/(trip)/${tripId}`);
    }, [router]);

    const handleCreate = useCallback(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCreateVisible(true);
    }, []);

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
                        progressViewOffset={HERO_HEIGHT}
                    />
                }
                contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}
            >
                {/* ── Hero ──────────────────────────────────────────────── */}
                <View style={{ height: HERO_HEIGHT }}>
                    <ImageBackground
                        source={heroSource}
                        style={styles.hero}
                        resizeMode="cover"
                    >
                        <View style={styles.heroScrim} />

                        {/* ─ Floating header — ABSOLUTELY POSITIONED at top ─
                            Previous bug: this was a regular flex child inside
                            a justifyContent:'flex-end' container, so it
                            appeared at the bottom of the hero, not the top.
                            Fix: position:'absolute', top:0 — decoupled from
                            the flex stack, anchored to the hero's top edge.
                            SafeAreaView with edges:['top'] adds the correct
                            status-bar inset without a hardcoded magic number. */}
                        <SafeAreaView edges={['top']} style={styles.heroHeader}>
                            <Pressable
                                onPress={() => setMenuDrawerVisible(true)}
                                hitSlop={12}
                                accessibilityLabel="Open menu"
                                accessibilityRole="button"
                                style={styles.heroHeaderBtn}
                            >
                                <Icon name="header.menu" size={24} color="#FFFFFF" />
                            </Pressable>
                            {/* Bell icon removed — notifications not yet implemented */}
                        </SafeAreaView>

                        {/* Greeting — sits at the bottom of the hero */}
                        <View style={styles.heroContent}>
                            <Text style={styles.heroWelcome}>Welcome back,</Text>
                            <Text style={styles.heroName} numberOfLines={1}>
                                {displayName}
                            </Text>
                        </View>
                    </ImageBackground>

                    {/* Stat cards — overlap the hero bottom edge */}
                    <Animated.View style={[styles.statRow, { marginTop: -STAT_OVERLAP }, statAnimStyle]}>
                        <StatCard label="You are owed" paise={totalOwed} colorRole="owed" />
                        <StatCard label="You owe" paise={totalOwe} colorRole="owe" />
                        <StatCard label="Total spent" paise={totalSpent} colorRole="neutral" />
                    </Animated.View>
                </View>

                {/* ── Recent groups ──────────────────────────────────────── */}
                <Animated.View style={[styles.section, listAnimStyle]}>
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
                    ) : isLoading && trips.length === 0 ? (
                        <View style={styles.list}>
                            {[1, 2, 3].map((k) => (
                                <View key={k} style={{ borderRadius: radii.lg, overflow: 'hidden' }}>
                                    <SkeletonTripCard />
                                </View>
                            ))}
                        </View>
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
                </Animated.View>
            </ScrollView>

            {/* Side-drawer menu — overlays tab bar and content */}
            <MenuDrawer
                visible={menuDrawerVisible}
                onClose={() => setMenuDrawerVisible(false)}
            />

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

    // Hero — fixed height, image fills it
    hero: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',   // heroContent sits at the bottom
    },
    heroScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.32)',
    },

    // Header — absolute so it doesn't participate in flex layout,
    // allowing justifyContent:'flex-end' to only affect heroContent.
    heroHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    heroHeaderBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Greeting at hero bottom
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

    // Stat row — positioned to overlap the hero bottom
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
    list: { gap: spacing.sm },
});