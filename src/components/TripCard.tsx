/**
 * src/components/TripCard.tsx
 *
 * Trip list card for the Home/Groups screens.
 * Shows emoji tile, name, destination, date range, member count, pending sync badge.
 *
 * Fix: removed colors.accentWarning (didn't exist) → colors.warning + colors.warningMuted.
 * Fix: replaced hardcoded font sizes with typography tokens.
 * Fix: removed Platform.select shadow in favour of shadows.low token.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../hooks/useThemeColors';
import { useMemberStore } from '../stores/memberStore';
import type { Trip } from '../types/domain';
import { typography, spacing, radii, shadows } from '@/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRIP_EMOJIS = ['🏕️', '🏞️', '🛣️', '🏖️', '🏜️', '🏙️', '🌉', '🌅'] as const;

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface TripCardProps {
    trip: Trip;
    pendingSyncCount: number;
    onPress: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

function TripCardInner({ trip, pendingSyncCount, onPress }: TripCardProps) {
    const colors = useThemeColors();
    const emoji = getTripEmoji(trip.id);
    const dateLabel = formatDateRange(trip.startDate, trip.endDate);
    const memberCount = useMemberStore((s) => (s.members[trip.id] ?? []).length);

    return (
        <Pressable
            style={({ pressed }) => [
                styles.card,
                {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    opacity: pressed ? 0.88 : 1,
                },
                shadows.low,
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
                    <Text style={[typography.bodyMd, { color: colors.text }]} numberOfLines={1}>
                        {trip.name}
                    </Text>

                    {trip.destination ? (
                        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                            📍 {trip.destination}
                        </Text>
                    ) : null}

                    {dateLabel ? (
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            🗓 {dateLabel}
                        </Text>
                    ) : null}

                    {/* Badges */}
                    <View style={styles.badgeRow}>
                        {memberCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: colors.subSurface }]}>
                                <Text style={[typography.label, { color: colors.textSecondary }]}>
                                    👥 {memberCount}
                                </Text>
                            </View>
                        )}
                        {pendingSyncCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: colors.warningMuted }]}>
                                <Text style={[typography.label, { color: colors.warning }]}>
                                    ⏳ {pendingSyncCount} PENDING
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    card: {
        borderRadius: radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        gap: spacing.md,
    },
    emojiBox: {
        width: 52,
        height: 52,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    emojiText: { fontSize: 26 },
    info: { flex: 1, minWidth: 0, gap: 2 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    badge: {
        borderRadius: radii.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
    },
    chevron: { fontSize: 22, fontWeight: '300', flexShrink: 0 },
});