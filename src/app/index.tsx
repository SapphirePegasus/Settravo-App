/**
 * app/index.tsx — Home screen
 *
 * Phase 4 changes:
 *  4.1  TripCard extracted to src/components/TripCard.tsx
 *  4.1  Time-of-day greeting: Good morning/afternoon/evening
 *  4.1  Full-screen empty state with two prominent CTAs
 *  4.9  Haptic feedback on primary actions
 *  4.10 fetchError surfaces as toast (plan 7.5)
 *  4.11 Per-trip pending sync count passed to TripCard
 *  2.3  isDark removed — useThemeColors() throughout
 *  2.3  CreateTripModal migration note (isDark still passed — pending migration)
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
  useColorScheme,
  View,
} from 'react-native';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { CreateTripModal } from '../components/CreateTripModal';
import { TripCard } from '../components/TripCard';
import { useToast } from '../components/Toast';
import { useThemeColors } from '../hooks/useThemeColors';
import { useTrips } from '../hooks/useTrips';
import { useAuthStore } from '../stores/authStore';
import { useTripStore } from '../stores/tripStore';

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

  // isDark still needed only for CreateTripModal (not yet migrated)
  const isDark = useColorScheme() === 'dark';

  const deviceUser = useAuthStore((s) => s.deviceUser);
  const offlineQueue = useTripStore((s) => s.offlineQueue);

  const { trips, isLoading, fetchError, refresh } = useTrips();

  const [createModalVisible, setCreateModalVisible] = useState(false);

  // Surface fetch errors as toast (plan 7.5)
  useEffect(() => {
    if (fetchError) {
      showToast({
        message: 'Could not refresh trips. Pull down to retry.',
        variant: 'error',
      });
    }
  }, [fetchError, showToast]);

  // Per-trip pending sync count — items in the queue keyed by tripId
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

  const totalPending = offlineQueue.length;

  const handleTripPress = useCallback(
    async (tripId: string) => {
      await Haptics.selectionAsync();
      useTripStore.getState().setActiveTripId(tripId);
      router.push(`/(trip)/${tripId}`);
    },
    [router],
  );

  const handleNewTrip = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCreateModalVisible(true);
  }, []);

  const handleJoinTrip = useCallback(async () => {
    await Haptics.selectionAsync();
    router.push('/(trip)/join');
  }, [router]);

  // ── List components ───────────────────────────────────────────────────────

  const ListHeader = useMemo(() => (
    <View style={styles.header}>
      <View style={styles.greetingRow}>
        <View style={styles.greetingTextGroup}>
          <Text style={[styles.greeting, { color: colors.subText }]}>
            {getGreeting(deviceUser?.displayName ?? null)}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>My Trips</Text>
        </View>
        {totalPending > 0 && (
          <View style={[styles.pendingBadge, { backgroundColor: colors.accentWarning }]}>
            <Text style={styles.pendingBadgeText}>{totalPending}</Text>
          </View>
        )}
      </View>
    </View>
  ), [colors, deviceUser?.displayName, totalPending]);

  const ListEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIllustration}>🗺️</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No trips yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.subText }]}>
          Split expenses with friends,{'\n'}hassle-free.
        </Text>
        <Pressable
          style={[styles.emptyPrimary, { backgroundColor: colors.accent }]}
          onPress={handleNewTrip}
          accessibilityRole="button"
        >
          <Text style={styles.emptyPrimaryText}>＋ Create Trip</Text>
        </Pressable>
        <Pressable
          style={[styles.emptySecondary, {
            borderColor: colors.separator,
            backgroundColor: colors.card,
          }]}
          onPress={handleJoinTrip}
          accessibilityRole="button"
        >
          <Text style={[styles.emptySecondaryText, { color: colors.text }]}>
            Join with Code
          </Text>
        </Pressable>
      </View>
    );
  }, [isLoading, colors, handleNewTrip, handleJoinTrip]);

  const renderItem = useCallback(({ item }: { item: typeof trips[number] }) => (
    <TripCard
      trip={item}
      pendingSyncCount={pendingSyncByTrip[item.id] ?? 0}
      onPress={() => handleTripPress(item.id)}
    />
  ), [pendingSyncByTrip, handleTripPress]);

  const keyExtractor = useCallback((item: typeof trips[number]) => item.id, []);

  const ItemSeparator = useCallback(
    () => <View style={styles.separator} />,
    [],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ConnectionBanner />

      <FlatList
        data={trips}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={[
          styles.listContent,
          trips.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor={colors.accent}
          />
        }
      />

      {/* Footer CTAs — only shown when trips exist */}
      {trips.length > 0 && (
        <View style={[styles.footer, {
          borderTopColor: colors.separator,
          backgroundColor: colors.bg,
        }]}>
          <Pressable
            style={[styles.secondaryButton, { backgroundColor: colors.card }]}
            onPress={handleJoinTrip}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Join Trip
            </Text>
          </Pressable>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={handleNewTrip}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>＋ New Trip</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={createModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <CreateTripModal
          isDark={isDark}
          onClose={() => setCreateModalVisible(false)}
          onCreated={(trip) => {
            setCreateModalVisible(false);
            useTripStore.getState().addTrip(trip);
            void handleTripPress(trip.id);
          }}
        />
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 20 },
  listContentEmpty: { flexGrow: 1 },

  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  greetingTextGroup: { flex: 1 },
  greeting: { fontSize: 15, marginBottom: 2 },
  title: { fontSize: 34, fontWeight: '700' },

  pendingBadge: {
    marginTop: 6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  pendingBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  separator: { height: 10 },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyIllustration: { fontSize: 72, marginBottom: 20 },
  emptyTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 40 },
  emptyPrimary: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptySecondary: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptySecondaryText: { fontSize: 16, fontWeight: '500' },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '500' },
  primaryButton: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});