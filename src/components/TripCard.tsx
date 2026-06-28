/**
 * TripCard.tsx
 *
 * Trip list card for the Home screen. Shows:
 *  - Emoji tile (deterministic from tripId)
 *  - Trip name + destination
 *  - Date range
 *  - Member count + pending sync badge
 *
 * Extracted from index.tsx as part of Phase 4 — sub-component extraction.
 * React.memo with ID equality so FlatList only re-renders changed cards.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';
import { useMemberStore } from '../stores/memberStore';
import { useTripStore } from '../stores/tripStore';
import type { Trip } from '../types/domain';

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
    return `Until ${fmt(end!)}`;
}

interface Props {
    trip: Trip;
    pendingSyncCount: number;
    onPress: () => void;
}

function TripCardInner({ trip, pendingSyncCount, onPress }: Props) {
    const colors = useThemeColors();
    const emoji = getTripEmoji(trip.id);
    const dateLabel = formatDateRange(trip.startDate, trip.endDate);

    // Member count from memberStore — already populated when trips are loaded
    const memberCount = useMemberStore(
        (s) => (s.members[trip.id] ?? []).length,
    );

    return (
        <Pressable
            style={({ pressed }) => [
                styles.card,
                {
                    backgroundColor: colors.card,
                    opacity: pressed ? 0.88 : 1,
                },
            ]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Open trip: ${trip.name}`}
        >
            <View style={styles.inner}>
                {/* Emoji tile */}
                <View style={[styles.emojiBox, { backgroundColor: colors.emojiBox }]}>
                    <Text style={styles.emojiText}>{emoji}</Text>
                </View>

                {/* Info */}
                <View style={styles.info}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {trip.name}
                    </Text>

                    {trip.destination ? (
                        <Text style={[styles.sub, { color: colors.subText }]} numberOfLines={1}>
                            📍 {trip.destination}
                        </Text>
                    ) : null}

                    {dateLabel ? (
                        <Text style={[styles.sub, { color: colors.subText }]}>
                            🗓 {dateLabel}
                        </Text>
                    ) : null}

                    {/* Badges row */}
                    <View style={styles.badgeRow}>
                        {memberCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: colors.cardElevated }]}>
                                <Text style={[styles.badgeText, { color: colors.subText }]}>
                                    👥 {memberCount}
                                </Text>
                            </View>
                        )}
                        {pendingSyncCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: colors.accentWarning + '22' }]}>
                                <Text style={[styles.badgeText, { color: colors.accentWarning }]}>
                                    ⏳ {pendingSyncCount} pending
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <Text style={[styles.chevron, { color: colors.subText }]}>›</Text>
            </View>
        </Pressable>
    );
}

export const TripCard = React.memo(TripCardInner, (prev, next) =>
    prev.trip.id === next.trip.id &&
    prev.trip.name === next.trip.name &&
    prev.trip.destination === next.trip.destination &&
    prev.trip.startDate === next.trip.startDate &&
    prev.trip.endDate === next.trip.endDate &&
    prev.pendingSyncCount === next.pendingSyncCount,
);

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        marginHorizontal: 20,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.07,
                shadowRadius: 8,
            },
            android: { elevation: 2 },
        }),
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 12,
    },
    emojiBox: {
        width: 52,
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    emojiText: { fontSize: 26 },
    info: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontSize: 16, fontWeight: '600' },
    sub: { fontSize: 13 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    badge: {
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    badgeText: { fontSize: 12, fontWeight: '500' },
    chevron: { fontSize: 22, fontWeight: '300', flexShrink: 0 },
});