/**
 * src/components/TripCard.tsx
 *
 * Trip list card for the Home/Groups screens.
 *
 * Thumbnail priority:
 *   1. trip.coverImageUrl — Supabase-hosted cover photo (expo-image, cached)
 *   2. Icon tile — hash-picked from TRIP_TILE_POOL when no photo set
 *
 * Design: 56×56 rounded thumbnail on the left, info column, chevron right.
 * Memo comparison updated to include coverImageUrl so cover changes re-render.
 */

import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './ui/Icon';
import { getTripTileIcon } from '../config/icons';
import { useThemeColors } from '../hooks/useThemeColors';
import { useMemberStore } from '../stores/memberStore';
import type { Trip } from '../types/domain';
import { typography, spacing, radii, shadows } from '@/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: string | null, end: string | null): string | null {
    if (!start && !end) return null;
    const fmt = (d: string) =>
        new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    if (start && end) return `${fmt(start)} – ${fmt(end)}`;
    if (start) return `From ${fmt(start)}`;
    return `Until ${fmt(end!)}`;
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

interface ThumbnailProps {
    trip: Trip;
}

function Thumbnail({ trip }: ThumbnailProps) {
    const colors = useThemeColors();
    const tileIcon = getTripTileIcon(trip.id);
    const [imageError, setImageError] = useState(false);
    const showImage = Boolean(trip.coverImageUrl) && !imageError;

    return (
        <View style={[styles.thumbnailBox, { backgroundColor: colors.emojiBox }]}>
            {showImage ? (
                <Image
                    source={{ uri: trip.coverImageUrl! }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={150}
                    onError={() => setImageError(true)}
                />
            ) : (
                <Icon name={tileIcon} size={24} color={colors.accent} />
            )}
        </View>
    );
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
                <Thumbnail trip={trip} />

                <View style={styles.info}>
                    <Text style={[typography.bodyMd, { color: colors.text }]} numberOfLines={1}>
                        {trip.name}
                    </Text>

                    {trip.destination ? (
                        <View style={styles.metaRow}>
                            <Icon name="nav.place" size={12} color={colors.textSecondary} />
                            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                                {trip.destination}
                            </Text>
                        </View>
                    ) : null}

                    {dateLabel ? (
                        <View style={styles.metaRow}>
                            <Icon name="nav.calendar" size={12} color={colors.textSecondary} />
                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                {dateLabel}
                            </Text>
                        </View>
                    ) : null}

                    <View style={styles.badgeRow}>
                        {memberCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: colors.subSurface }]}>
                                <Icon name="nav.groups" size={11} color={colors.textSecondary} />
                                <Text style={[typography.label, { color: colors.textSecondary }]}>
                                    {memberCount}
                                </Text>
                            </View>
                        )}
                        {pendingSyncCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: colors.warningMuted }]}>
                                <Icon name="status.syncing" size={11} color={colors.warning} />
                                <Text style={[typography.label, { color: colors.warning }]}>
                                    {pendingSyncCount} PENDING
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <Icon name="header.forward" size={20} color={colors.textSecondary} />
            </View>
        </Pressable>
    );
}

export const TripCard = React.memo(TripCardInner, (prev, next) =>
    prev.trip.id === next.trip.id &&
    prev.trip.name === next.trip.name &&
    prev.trip.coverImageUrl === next.trip.coverImageUrl &&
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
    thumbnailBox: {
        width: 56,
        height: 56,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',      // clips the Image to rounded corners
    },
    info: { flex: 1, minWidth: 0, gap: 3 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderRadius: radii.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
    },
});