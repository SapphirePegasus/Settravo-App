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
import { useMyBalances } from '../../hooks/useMyBalances';
import { useTrips } from '../../hooks/useTrips';
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

    const { trips, isLoading, fetchError, refresh } = useTrips();

    // Cross-trip balances — SAME engine as Statistics and the Settle screen
    // (utils/balances → calculateSettlements). Replaces the old inline loop
    // that compared split member-IDs against the auth uid (wrong ID space)
    // and ignored other members' settle state — the source of the
    // dashboard/statistics mismatch. useMyBalances also cache-hydrates every
    // joined trip, so the numbers are complete on a fresh launch, offline
    // included. Balances are all-time-until-settled; totalSpent is all-time.
    const { owedToMe: totalOwed, iOwe: totalOwe, totalSpent } = useMyBalances();
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

                <ImageBackground
                    source={heroSource}
                    style={styles.hero}
                    resizeMode="cover"
                >

                    <View style={styles.heroScrim} />

                    {/* Floating header — position:absolute inside ImageBackground.
                        SafeAreaView edges:['top'] pads for the status bar. */}
                    <SafeAreaView edges={['top']} style={styles.heroHeader}>
                        <Pressable
                            onPress={() => setMenuDrawerVisible(true)}
                            hitSlop={12}
                            accessibilityLabel="Open menu"
                            accessibilityRole="button"
                            style={styles.heroHeaderBtn}
                        >
                            <Icon name="header.menu" size={24} color={colors.text} />
                        </Pressable>
                        {/* Bell icon removed — notifications not yet implemented */}
                    </SafeAreaView>

                    {/* Greeting — flex-end pushes it to hero bottom */}
                    <View style={styles.heroContent}>
                        <Text style={[styles.heroWelcome, { color: colors.text }]}>Welcome back,</Text>
                        <Text style={[styles.heroName, { color: colors.text }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                    </View>
                </ImageBackground>

                {/* Stat cards — next ScrollView sibling, negative marginTop
                    visually overlaps the hero's bottom edge. */}
                <Animated.View style={[styles.statRow, statAnimStyle]}>
                    <StatCard label="Others owe to you" paise={totalOwed} colorRole="owed" />
                    <StatCard label="You owe to others" paise={totalOwe} colorRole="owe" />
                    <StatCard label="Total expense" paise={totalSpent} colorRole="neutral" />
                </Animated.View>

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
                            subtitle="Create or Join your first group from by clicking the + (plus) icon below."
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

    // Hero — in-flow element with explicit height so its sibling (statRow)
    // renders below it. justifyContent:'flex-end' pushes heroContent down.
    hero: {
        height: HERO_HEIGHT,
        width: '100%',
        justifyContent: 'flex-end',
    },
    heroScrim: {
        ...StyleSheet.absoluteFillObject,  // scoped to ImageBackground, not screen
        backgroundColor: 'rgba(0,0,0,0)',
    },

    // Header — absolute inside ImageBackground, anchored to its top edge.
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
        marginBottom: 4,
    },
    heroName: {
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: -0.5,
    },

    // Stat row — negative marginTop overlaps the hero bottom edge.
    // Works correctly because ImageBackground is now a normal flow element.
    statRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        marginTop: -STAT_OVERLAP,
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