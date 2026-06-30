/**
 * app/(trip)/[tripId]/activity.tsx — Group Activity (D.10)
 *
 * Activity timeline scoped to one trip. Filter: All | Expenses | Settlements.
 * Same visual pattern as (tabs)/activity.tsx but no group picker needed.
 */

import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/ui/Avatar';
import { AmountText } from '../../../components/ui/AmountText';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useExpenses } from '../../../hooks/useExpenses';
import { useMembers } from '../../../hooks/useMembers';
import { useExpenseStore } from '../../../stores/expenseStore';
import { typography, spacing, radii } from '@/theme';

type FilterMode = 'all' | 'expenses' | 'settlements';

interface ActivityItem {
    id: string;
    actorName: string;
    description: string;
    amountPaise?: number;
    timestamp: string;
    kind: 'expense' | 'settlement';
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

export default function TripActivityScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const colors = useThemeColors();
    const members = useMembers(tripId ?? '');
    const { expenses } = useExpenses(tripId ?? '');
    const splits = useExpenseStore((s) => s.splits);

    const [filter, setFilter] = useState<FilterMode>('all');

    const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.displayName])), [members]);

    const sections = useMemo(() => {
        const items: ActivityItem[] = [];

        if (filter === 'all' || filter === 'expenses') {
            for (const exp of expenses) {
                items.push({
                    id: exp.id, kind: 'expense',
                    actorName: memberMap.get(exp.paidByMember) ?? 'Someone',
                    description: `added ${exp.title}`,
                    amountPaise: exp.amountMoney,
                    timestamp: exp.createdAt,
                });
            }
        }

        if (filter === 'all' || filter === 'settlements') {
            // NOTE: Split has no `settledAt` timestamp in the current schema —
            // only a boolean `isSettled`. We cannot show an accurate settlement
            // date/time until the backend adds a settled_at column. As a
            // reasonable proxy, we use the parent expense's createdAt so the
            // item still appears in a sensible position on the timeline.
            // TODO(backend): add settled_at timestamptz to TravelAppSplits,
            // then replace `exp.createdAt` below with the real value.
            for (const exp of expenses) {
                const expenseSplits = splits[exp.id] ?? [];
                for (const sp of expenseSplits) {
                    if (sp.isSettled) {
                        items.push({
                            id: `settle-${sp.id}`, kind: 'settlement',
                            actorName: memberMap.get(sp.memberId) ?? 'Someone',
                            description: 'marked their share as settled',
                            amountPaise: sp.shareMoney,
                            timestamp: exp.createdAt,
                        });
                    }
                }
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
    }, [expenses, splits, memberMap, filter]);

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
            {/* Filter segmented control */}
            <View style={styles.filterRow}>
                {(['all', 'expenses', 'settlements'] as const).map((mode) => (
                    <Pressable
                        key={mode}
                        style={[
                            styles.filterBtn,
                            { backgroundColor: filter === mode ? colors.accent : colors.subSurface },
                        ]}
                        onPress={() => setFilter(mode)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: filter === mode }}
                    >
                        <Text style={[typography.caption, { color: filter === mode ? colors.textInverse : colors.textSecondary, fontWeight: '600' }]}>
                            {mode === 'all' ? 'ALL' : mode === 'expenses' ? 'EXPENSES' : 'SETTLEMENTS'}
                        </Text>
                    </Pressable>
                ))}
            </View>

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                renderSectionHeader={({ section }) => (
                    <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
                        {(section as { title: string }).title.toUpperCase()}
                    </Text>
                )}
                renderItem={({ item }) => (
                    <View style={[styles.row, { backgroundColor: colors.card }]}>
                        <Avatar name={item.actorName} size="md" />
                        <View style={styles.rowInfo}>
                            <Text style={[typography.body, { color: colors.text }]}>
                                <Text style={typography.bodyMd}>{item.actorName}</Text> {item.description}
                            </Text>
                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                {formatTime(item.timestamp)} {item.kind === 'settlement' ? '· ✓ Settled' : ''}
                            </Text>
                        </View>
                        {item.amountPaise != null && (
                            <AmountText paise={item.amountPaise} sign="neutral" size="sm" />
                        )}
                    </View>
                )}
                ListEmptyComponent={
                    <EmptyState illustration="📋" title="No activity yet" subtitle="Expenses and settlements for this trip will show here." />
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    filterRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
    filterBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.sm, alignItems: 'center' },
    listContent: { padding: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.sm },
    rowInfo: { flex: 1, gap: 2 },
});