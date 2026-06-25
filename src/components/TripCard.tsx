/**
 * TripCard.tsx
 *
 * Pressable card shown in the home screen trip list.
 * Shows trip name, destination, date range, and join code expiry indicator.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Trip } from '../types/domain';
import { isJoinCodeExpired } from '../utils/joinCode';

interface Props {
    trip: Trip;
    isDark: boolean;
    onPress: () => void;
}

export function TripCard({ trip, isDark, onPress }: Props) {
    const colors = isDark ? dark : light;
    const codeExpired = isJoinCodeExpired(trip.joinCodeExpiresAt);

    const dateLabel = formatDateRange(trip.startDate, trip.endDate);

    return (
        <Pressable
            style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={onPress}
        >
            <View style={styles.row}>
                <View style={styles.info}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {trip.name}
                    </Text>
                    {trip.destination ? (
                        <Text style={[styles.sub, { color: colors.subText }]} numberOfLines={1}>
                            {trip.destination}
                        </Text>
                    ) : null}
                    {dateLabel ? (
                        <Text style={[styles.sub, { color: colors.subText }]}>{dateLabel}</Text>
                    ) : null}
                </View>
                {/* Join code status dot */}
                {trip.joinCode !== null && !codeExpired ? (
                    <View style={[styles.dot, { backgroundColor: colors.activeCodeDot }]} />
                ) : null}
                <Text style={[styles.chevron, { color: colors.subText }]}>›</Text>
            </View>
        </Pressable>
    );
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

const styles = StyleSheet.create({
    card: { borderRadius: 16, padding: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    info: { flex: 1 },
    name: { fontSize: 17, fontWeight: '600', marginBottom: 2 },
    sub: { fontSize: 13, marginTop: 1 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    chevron: { fontSize: 20, lineHeight: 24 },
});

const light = { card: '#ffffff', text: '#000000', subText: '#6c6c70', activeCodeDot: '#34c759' };
const dark = { card: '#1c1c1e', text: '#ffffff', subText: '#8e8e93', activeCodeDot: '#30d158' };