/**
 * app/index.tsx — Home screen
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { CreateTripModal } from '../components/CreateTripModal';
import { useTrips } from '../hooks/useTrips';
import { useAuthStore } from '../stores/authStore';
import { useTripStore } from '../stores/tripStore';
import type { Trip } from '../types/domain';
import { useThemeColors } from '../hooks/useThemeColors';


const TRIP_EMOJIS = ['🏕️', '🏞️', '🛣️', '🏖️', '🏜️', '🏙️', '🌉', '🌅'];

function getTripEmoji(tripId: string): string {
  let hash = 0;
  for (let i = 0; i < tripId.length; i++) {
    hash = tripId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TRIP_EMOJIS[Math.abs(hash) % TRIP_EMOJIS.length];
}

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return null;
}

function TripCard({
  trip,
  isDark,
  onPress,
}: {
  trip: Trip;
  isDark: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const emoji = getTripEmoji(trip.id);
  const dateLabel = formatDateRange(trip.startDate, trip.endDate);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={styles.cardInner}>
        <View style={[styles.emojiBox, { backgroundColor: colors.emojiBox }]}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
            {trip.name}
          </Text>
          {trip.destination ? (
            <Text style={[styles.cardSub, { color: colors.subText }]} numberOfLines={1}>
              {trip.destination}
            </Text>
          ) : null}
          {dateLabel ? (
            <Text style={[styles.cardSub, { color: colors.subText }]}>{dateLabel}</Text>
          ) : null}
        </View>
        <Text style={[styles.chevron, { color: colors.subText }]}>›</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = useColorScheme() === 'dark';

  const deviceUser = useAuthStore((s) => s.deviceUser);
  const { trips, isLoading, refresh } = useTrips();

  const [createModalVisible, setCreateModalVisible] = useState(false);

  const handleTripPress = useCallback(
    (tripId: string) => {
      useTripStore.getState().setActiveTripId(tripId);
      router.push(`/(trip)/${tripId}`);
    },
    [router],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ConnectionBanner />

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
            <Text style={[styles.greeting, { color: colors.subText }]}>
              Hey, {deviceUser?.displayName ?? '—'}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>My Trips</Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
              <Text style={styles.emptyEmoji}>🗺️</Text>
              <Text style={[styles.emptyText, { color: colors.subText }]}>
                No trips yet.{'\n'}Create one or join with a code.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TripCard trip={item} isDark={isDark} onPress={() => handleTripPress(item.id)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View style={[styles.footer, { borderTopColor: colors.separator, backgroundColor: colors.bg }]}>
        <Pressable
          style={[styles.secondaryButton, { backgroundColor: colors.card }]}
          onPress={() => router.push('/(trip)/join')}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Join Trip</Text>
        </Pressable>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.primaryButtonText}>+ New Trip</Text>
        </Pressable>
      </View>

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
            handleTripPress(trip.id);
          }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 20 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    marginBottom: 16,
  },
  greeting: { fontSize: 15, marginBottom: 4 },
  title: { fontSize: 34, fontWeight: '700' },
  emptyCard: { borderRadius: 16, padding: 32, alignItems: 'center', marginHorizontal: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  separator: { height: 10 },

  card: {
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 14,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emojiBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 17, fontWeight: '600', marginBottom: 2 },
  cardSub: { fontSize: 13, marginTop: 1 },
  chevron: { fontSize: 22, lineHeight: 26 },

  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '500' },
});