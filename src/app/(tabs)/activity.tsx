/**
 * app/(tabs)/activity.tsx — User Activity (D.11)
 *
 * Cross-group activity timeline, grouped by date (Today / Yesterday / date).
 * Filter: "All Groups" dropdown narrows to a single trip.
 *
 * All emoji replaced with <Icon /> or plain text.
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
import { AmountText } from '../../components/ui/AmountText';
import { EmptyState } from '../../components/ui/EmptyState';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Icon } from '../../components/ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useExpenseStore } from '../../stores/expenseStore';
import { useMemberStore } from '../../stores/memberStore';
import { useTripStore } from '../../stores/tripStore';
import { typography, spacing, radii } from '@/theme';

interface ActivityItem {
    id: string;
    tripId: string;
    tripName: string;
    actorName: string;
    description: string;
    amountPaise?: number;
    timestamp: string;
}

interface ActivitySection {
    dateKey: string;
    title: string;
    data: ActivityItem[];
}

function formatSectionTitle(dateKey: string): string {
    const date = new Date(dateKey);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(date, today)) return 'Today';
    if (sameDay(date, yesterday)) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function ActivityScreen() {
    const router = useRouter();
    const colors = useThemeColors();
    const trips = useTripStore((s) => s.trips);
    const { loadExpenses } = useExpenseStore();
    const allExpenses = useExpenseStore((s) => s.expenses);
    const allMembers = useMemberStore((s) => s.members);

    const [filterVisible, setFilterVisible] = useState(false);
    const [filterTripId, setFilterTripId] = useState<string | null>(null);

    const tripNameMap = useMemo(() => new Map(trips.map((t) => [t.id, t.name])), [trips]);

    const sections: ActivitySection[] = useMemo(() => {
        const items: ActivityItem[] = [];

        for (const [tripId, expenseList] of Object.entries(allExpenses)) {
            if (filterTripId && tripId !== filterTripId) continue;
            const members = allMembers[tripId] ?? [];
            const memberMap = new Map(members.map((m) => [m.id, m.displayName]));

            for (const exp of expenseList) {
                items.push({
                    id: exp.id,
                    tripId,
                    tripName: tripNameMap.get(tripId) ?? 'Unknown trip',
                    actorName: memberMap.get(exp.paidByMember) ?? 'Someone',
                    description: `added ${exp.title}`,
                    amountPaise: exp.amountMoney,
                    timestamp: exp.createdAt,
                });
            }
        }

        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const grouped = new Map<string, ActivityItem[]>();
        for (const item of items) {
            const key = item.timestamp.slice(0, 10);
            const group = grouped.get(key) ?? [];
            group.push(item);
            grouped.set(key, group);
        }

        return Array.from(grouped.entries()).map(([dateKey, data]) => ({
            dateKey, title: formatSectionTitle(dateKey), data,
        }));
    }, [allExpenses, allMembers, tripNameMap, filterTripId]);

    const filterLabel = filterTripId ? (tripNameMap.get(filterTripId) ?? 'Unknown') : 'All Groups';

    // Trigger fetch for ALL trips on mount (and when trips list changes)
    useEffect(() => {
        trips.forEach((trip) => {
            // Only fetch if not already fetched (the store's hasFetched guard handles this)
            loadExpenses(trip.id);
        });
    }, [trips, loadExpenses]);

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={[typography.heading, { color: colors.text }]}>My Activity</Text>
                <Pressable
                    style={[styles.filterChip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                    onPress={() => setFilterVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Filter by group"
                >
                    <Text style={[typography.caption, { color: colors.text }]} numberOfLines={1}>
                        {filterLabel}
                    </Text>
                    <Icon name="header.forward" size={14} color={colors.icon} />
                </Pressable>
            </View>

            {/* Timeline */}
            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                renderSectionHeader={({ section }) => (
                    <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md }]}>
                        {(section as ActivitySection).title.toUpperCase()}
                    </Text>
                )}
                renderItem={({ item }) => (
                    <Pressable
                        style={[styles.row, { backgroundColor: colors.card }]}
                        onPress={() => router.push(`/(trip)/${item.tripId}`)}
                        accessibilityRole="button"
                    >
                        <Avatar name={item.actorName} size="md" />
                        <View style={styles.rowInfo}>
                            <Text style={[typography.body, { color: colors.text }]} numberOfLines={2}>
                                <Text style={typography.bodyMd}>{item.actorName}</Text> {item.description}
                            </Text>
                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                {item.tripName} · {formatTime(item.timestamp)}
                            </Text>
                        </View>
                        {item.amountPaise != null && (
                            <AmountText paise={item.amountPaise} sign="neutral" size="sm" />
                        )}
                    </Pressable>
                )}
                ListEmptyComponent={
                    <EmptyState
                        iconKey="nav.activity"
                        title="No activity yet"
                        subtitle="Expenses and settlements will show up here."
                    />
                }
            />

            {/* Group filter sheet */}
            <BottomSheet visible={filterVisible} onDismiss={() => setFilterVisible(false)}>
                <Text style={[typography.title, { color: colors.text, marginBottom: spacing.md }]}>
                    Filter by Group
                </Text>
                <Pressable
                    style={[styles.filterOption, !filterTripId && { backgroundColor: colors.accent }]}
                    onPress={() => { setFilterTripId(null); setFilterVisible(false); }}
                >
                    <Text style={[typography.bodyMd, { color: colors.text }]}>All Groups</Text>
                </Pressable>
                {trips.map((t) => (
                    <Pressable
                        key={t.id}
                        style={[styles.filterOption, filterTripId === t.id && { backgroundColor: colors.accentLight }]}
                        onPress={() => { setFilterTripId(t.id); setFilterVisible(false); }}
                    >
                        <Text style={[typography.bodyMd, { color: colors.text }]}>{t.name}</Text>
                    </Pressable>
                ))}
            </BottomSheet>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        borderRadius: radii.full,
        borderWidth: 1,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        maxWidth: 140,
    },
    listContent: { padding: spacing.md, paddingTop: 0 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.md,
        marginBottom: spacing.sm,
    },
    rowInfo: { flex: 1, gap: 2 },
    filterOption: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        borderRadius: radii.md,
    },
});