/**
 * app/(tabs)/index.tsx — Home (Dashboard) tab
 *
 * Phase B: moved from app/index.tsx to app/(tabs)/index.tsx.
 * This is the stub-equivalent for now — existing logic fully preserved.
 * Phase D.2 will redesign the full layout with hero image and stat cards.
 *
 * REFACTOR from app/index.tsx:
 *  - Removed isDark / useColorScheme() — CreateTripModal no longer needs isDark prop
 *  - CreateTripModal now reads theme internally
 *  - Removed isDark={isDark} prop from CreateTripModal call
 */

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConnectionBanner } from '../../components/ConnectionBanner';
import { CreateTripModal } from '../../components/CreateTripModal';
import { TripCard } from '../../components/TripCard';
import { useToast } from '../../components/Toast';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTrips } from '../../hooks/useTrips';
import { useAuthStore } from '../../stores/authStore';
import { useTripStore } from '../../stores/tripStore';
import { spacing, typography, radii, shadows } from '@/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(name: string | null): string {
    const hour = new Date().getHours();
    const salutation =
        hour < 12 ? 'Good morning' :
            hour < 17 ? 'Good afternoon' :
                'Good evening';
    return name ? `${salutation}, ${name} 👋` : salutation;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const offlineQueue = useTripStore((s) => s.offlineQueue);

    const { trips, isLoading, fetchError, refresh } = useTrips();

    const [createModalVisible, setCreateModalVisible] = useState(false);

    // Surface fetch errors as toast
    useEffect(() => {
        if (fetchError) {
            showToast({
                message: 'Could not refresh trips. Pull down to retry.',
                variant: 'error',
            });
        }
    }, [fetchError, showToast]);

    // Per-trip pending sync count
    const pendingSyncByTrip = useMemo(() => {
        const map: Record<string, number> = {};
        for (const item of offlineQueue) {
            const tripId =
                item.type === 'ADD_EXPENSE' ? item.payload.tripId :
                    item.type === 'DELETE_EXPENSE' ? item.payload.tripId :
                        item.type === 'EDIT_EXPENSE' ? (item.payload as { tripId?: string }).tripId ?? '' :
                            '';
            if (tripId) map[tripId] = (map[tripId] ?? 0) + 1;
        }
        return map;
    }, [offlineQueue]);

    const handleTripPress = useCallback(
        async (tripId: string) => {
            await Haptics.selectionAsync();
            router.push(`/(trip)/${tripId}`);
        },
        [router],
    );

    const handleCreatePress = useCallback(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCreateModalVisible(true);
    }, []);

    const handleJoinPress = useCallback(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/(trip)/join');
    }, [router]);

    // ── Render items ─────────────────────────────────────────────────────────

    const renderItem = useCallback(
        ({ item }: { item: (typeof trips)[number] }) => (
            <TripCard
                trip={item}
                pendingSyncCount={pendingSyncByTrip[item.id] ?? 0}
                onPress={() => handleTripPress(item.id)}
            />
        ),
        [pendingSyncByTrip, handleTripPress],
    );

    const keyExtractor = useCallback((item: (typeof trips)[number]) => item.id, []);

    // ── Empty state ───────────────────────────────────────────────────────────

    const ListEmpty = useMemo(() => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏕️</Text>
            <Text style={[typography.title, { color: colors.text, textAlign: 'center' }]}>
                No trips yet
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                Create your first group to start splitting expenses.
            </Text>
            <View style={styles.emptyActions}>
                <Pressable
                    style={[styles.emptyButton, { backgroundColor: colors.accent }]}
                    onPress={handleCreatePress}
                    accessibilityRole="button"
                >
                    <Text style={[typography.bodyMd, { color: colors.textInverse }]}>Create Group</Text>
                </Pressable>
                <Pressable
                    style={[styles.emptyButtonOutline, { borderColor: colors.accent }]}
                    onPress={handleJoinPress}
                    accessibilityRole="button"
                >
                    <Text style={[typography.bodyMd, { color: colors.accent }]}>Join with Code</Text>
                </Pressable>
            </View>
        </View>
    ), [colors, handleCreatePress, handleJoinPress]);

    // ── Header ────────────────────────────────────────────────────────────────

    const ListHeader = useMemo(() => (
        <View style={styles.listHeader}>
            <Text style={[typography.heading, { color: colors.text }]}>
                {getGreeting(deviceUser?.displayName ?? null)}
            </Text>
            {offlineQueue.length > 0 && (
                <View style={[styles.syncBadge, { backgroundColor: colors.warningMuted }]}>
                    <Text style={[typography.label, { color: colors.warning }]}>
                        {offlineQueue.length} PENDING
                    </Text>
                </View>
            )}
        </View>
    ), [colors, deviceUser, offlineQueue.length]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: colors.bg }]}
            edges={['top', 'left', 'right']}
        >
            <ConnectionBanner />

            <FlatList
                data={trips}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={[
                    styles.listContent,
                    trips.length === 0 && styles.listContentEmpty,
                ]}
                ListHeaderComponent={ListHeader}
                ListEmptyComponent={isLoading ? null : ListEmpty}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={refresh}
                        tintColor={colors.accent}
                        colors={[colors.accent]}
                    />
                }
                showsVerticalScrollIndicator={false}
            />

            {/* FAB row */}
            <View
                style={[
                    styles.fabRow,
                    {
                        backgroundColor: colors.surface,
                        borderTopColor: colors.separator,
                    },
                ]}
            >
                <Pressable
                    style={[styles.fabButton, { backgroundColor: colors.subSurface, borderColor: colors.cardBorder }]}
                    onPress={handleJoinPress}
                    accessibilityRole="button"
                    accessibilityLabel="Join a group with a code"
                >
                    <Text style={[typography.bodyMd, { color: colors.text }]}>Join Group</Text>
                </Pressable>
                <Pressable
                    style={[styles.fabButton, { backgroundColor: colors.accent }]}
                    onPress={handleCreatePress}
                    accessibilityRole="button"
                    accessibilityLabel="Create a new group"
                >
                    <Text style={[typography.bodyMd, { color: colors.textInverse }]}>+ Create Group</Text>
                </Pressable>
            </View>

            {/* Create trip modal */}
            <Modal
                visible={createModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCreateModalVisible(false)}
            >
                <CreateTripModal
                    onClose={() => setCreateModalVisible(false)}
                    onCreated={(trip) => {
                        setCreateModalVisible(false);
                        router.push(`/(trip)/${trip.id}`);
                    }}
                />
            </Modal>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },
    listContent: {
        padding: spacing.md,
        paddingBottom: spacing.xxl,
        gap: spacing.sm,
    },
    listContentEmpty: {
        flex: 1,
    },
    listHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    syncBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radii.sm,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.xl,
    },
    emptyEmoji: {
        fontSize: 64,
        marginBottom: spacing.md,
    },
    emptyActions: {
        gap: spacing.sm,
        width: '100%',
        marginTop: spacing.xl,
    },
    emptyButton: {
        height: 52,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyButtonOutline: {
        height: 52,
        borderRadius: radii.md,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fabRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        padding: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -1 }, shadowOpacity: 0.06, shadowRadius: 4 },
            android: { elevation: 4 },
        }),
    },
    fabButton: {
        flex: 1,
        height: 48,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
});