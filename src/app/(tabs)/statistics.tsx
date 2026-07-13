/**
 * app/(tabs)/statistics.tsx — Statistics (Phase-6 rewrite, mockup D.12)
 *
 * What changed and why:
 *  - DATA: the screen now owns its data via useStatisticsData — every joined
 *    trip's expenses/splits/members are cache-hydrated instantly and
 *    network-refreshed, instead of showing only whatever previous screens
 *    happened to load. Pull-to-refresh forces a refetch. Works offline from
 *    the SQLite cache.
 *  - CORRECTNESS: "you're owed / you owe" previously compared split
 *    member-IDs against the auth uid (different ID spaces) — always zero.
 *    Balances are now computed with the SAME tested pairwise engine as the
 *    Settle screen (calculateSettlements), summed over the transfers that
 *    involve MY member-id in each trip. One engine, one truth.
 *  - LAYOUT (mockup): time segmented control → Total Spending hero → donut
 *    with category legend → current-balance card → Top Groups ranked list.
 *  - Time filters scope SPENDING (hero, donut, top groups). The balance
 *    card is deliberately unfiltered: a debt exists until settled,
 *    regardless of when the expense happened — filtering it would show
 *    numbers that contradict the Settle screen.
 */

import { useMemo, useState } from 'react';
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DonutChart, type DonutSegment } from '../../components/stats/DonutChart';
import { AmountText } from '../../components/ui/AmountText';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useStatisticsData } from '../../hooks/useStatisticsData';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useConnectionStore } from '../../stores/connectionStore';
import { useExpenseStore } from '../../stores/expenseStore';
import { useMemberStore } from '../../stores/memberStore';
import type { Expense, ExpenseCategory, Split } from '../../types/domain';
import type { IconKey } from '../../config/icons';
import { calculateSettlements } from '../../utils/settlement';
import { formatRupees } from '../../utils/money';
import { typography, spacing, radii, shadows } from '@/theme';

// ─── Time filter ──────────────────────────────────────────────────────────────

type TimeFilter = 'month' | 'year' | 'all';

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
    { value: 'all', label: 'All Time' },
];

function isWithinFilter(dateIso: string, filter: TimeFilter): boolean {
    if (filter === 'all') return true;
    const date = new Date(dateIso);
    const now = new Date();
    if (filter === 'month') {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }
    return date.getFullYear() === now.getFullYear();
}

// ─── Category meta ────────────────────────────────────────────────────────────

const CATEGORY_META: { value: ExpenseCategory; label: string; iconKey: IconKey }[] = [
    { value: 'food', label: 'Food', iconKey: 'category.food' },
    { value: 'transport', label: 'Transport', iconKey: 'category.transport' },
    { value: 'stay', label: 'Stay', iconKey: 'category.stay' },
    { value: 'misc', label: 'Others', iconKey: 'category.others' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatisticsScreen() {
    const colors = useThemeColors();
    const { trips, myMemberIdByTrip, isRefreshing, refresh } = useStatisticsData();
    const allExpenses = useExpenseStore((s) => s.expenses);
    const allSplits = useExpenseStore((s) => s.splits);
    const allMembers = useMemberStore((s) => s.members);
    const networkOnline = useConnectionStore((s) => s.networkOnline);

    const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');

    // Theme-consistent, dark/light-safe 4-color palette.
    const categoryColors: Record<ExpenseCategory, string> = useMemo(
        () => ({
            food: colors.accent,
            transport: colors.warning,
            stay: colors.owe,
            misc: colors.textDisabled,
        }),
        [colors],
    );

    // ── Spending aggregation (time-filtered) ──────────────────────────────────
    const {
        totalSpent,
        expenseCount,
        categoryTotals,
        groupRows,
    } = useMemo(() => {
        let spent = 0;
        let count = 0;
        const catTotals: Record<ExpenseCategory, number> = {
            food: 0, transport: 0, stay: 0, misc: 0,
        };
        const rows: {
            tripId: string;
            name: string;
            memberCount: number;
            total: number;
        }[] = [];

        for (const trip of trips) {
            const list = (allExpenses[trip.id] ?? []).filter((e) =>
                isWithinFilter(e.createdAt, timeFilter),
            );
            let tripTotal = 0;
            for (const exp of list) {
                tripTotal += exp.amountMoney;
                catTotals[exp.category ?? 'misc'] += exp.amountMoney;
            }
            spent += tripTotal;
            count += list.length;
            if (tripTotal > 0) {
                rows.push({
                    tripId: trip.id,
                    name: trip.name,
                    memberCount: (allMembers[trip.id] ?? []).length,
                    total: tripTotal,
                });
            }
        }

        rows.sort((a, b) => b.total - a.total);
        return { totalSpent: spent, expenseCount: count, categoryTotals: catTotals, groupRows: rows };
    }, [trips, allExpenses, allMembers, timeFilter]);

    // ── Current balances (NOT time-filtered — must match the Settle screen) ───
    const { totalOwedToMe, totalIOwe } = useMemo(() => {
        let owedToMe = 0;
        let iOwe = 0;

        for (const trip of trips) {
            const myMemberId = myMemberIdByTrip.get(trip.id);
            if (!myMemberId) continue;

            const expenses: Expense[] = allExpenses[trip.id] ?? [];
            if (expenses.length === 0) continue;

            const flatSplits: Split[] = [];
            for (const exp of expenses) {
                for (const sp of allSplits[exp.id] ?? []) flatSplits.push(sp);
            }

            // The same tested pairwise engine as the Settle screen.
            const pending = calculateSettlements(
                expenses,
                flatSplits,
                allMembers[trip.id] ?? [],
            );
            for (const s of pending) {
                if (s.toMemberId === myMemberId) owedToMe += s.amountMoney;
                else if (s.fromMemberId === myMemberId) iOwe += s.amountMoney;
            }
        }
        return { totalOwedToMe: owedToMe, totalIOwe: iOwe };
    }, [trips, myMemberIdByTrip, allExpenses, allSplits, allMembers]);

    const donutSegments: DonutSegment[] = useMemo(
        () =>
            CATEGORY_META.map((c) => ({
                key: c.value,
                value: categoryTotals[c.value],
                color: categoryColors[c.value],
            })),
        [categoryTotals, categoryColors],
    );

    const hasSpending = totalSpent > 0;
    const maxGroupTotal = groupRows.length > 0 ? groupRows[0].total : 1;

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: colors.bg }]}
            edges={['top', 'left', 'right']}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={refresh}
                        tintColor={colors.accent}
                    />
                }
            >
                <Text style={[typography.heading, { color: colors.text, marginBottom: spacing.md }]}>
                    Statistics
                </Text>

                {!networkOnline && (
                    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                        Offline — showing your last synced data.
                    </Text>
                )}

                {/* ── Time segmented control ─────────────────────────── */}
                <View style={[styles.filterRow, { backgroundColor: colors.subSurface }]}>
                    {TIME_FILTERS.map((f) => {
                        const active = timeFilter === f.value;
                        return (
                            <Pressable
                                key={f.value}
                                style={[
                                    styles.filterBtn,
                                    active && { backgroundColor: colors.accent },
                                ]}
                                onPress={() => setTimeFilter(f.value)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: active }}
                            >
                                <Text
                                    style={[
                                        typography.caption,
                                        {
                                            color: active ? colors.textInverse : colors.textSecondary,
                                            fontWeight: '600',
                                        },
                                    ]}
                                >
                                    {f.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {!hasSpending ? (
                    <EmptyState
                        iconKey="nav.statistics"
                        title="No spending in this period"
                        subtitle="Add some expenses to see your statistics here."
                    />
                ) : (
                    <>
                        {/* ── Total Spending hero ────────────────────── */}
                        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }, shadows.low]}>
                            <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }]}>
                                Total Spending
                            </Text>
                            <AmountText paise={totalSpent} style={[typography.heading, { color: colors.text }]} />
                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                {expenseCount} expense{expenseCount === 1 ? '' : 's'} across{' '}
                                {groupRows.length} group{groupRows.length === 1 ? '' : 's'}
                            </Text>
                        </View>

                        {/* ── Donut + legend ─────────────────────────── */}
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, shadows.low]}>
                            <Text style={[typography.title, { color: colors.text, marginBottom: spacing.md }]}>
                                Spending by Category
                            </Text>
                            <DonutChart
                                segments={donutSegments}
                                centerPrimary={formatRupees(totalSpent)}
                                centerSecondary={TIME_FILTERS.find((f) => f.value === timeFilter)?.label}
                            />
                            <View style={styles.legend}>
                                {CATEGORY_META.map((c) => {
                                    const value = categoryTotals[c.value];
                                    const pct = totalSpent > 0 ? Math.round((value / totalSpent) * 100) : 0;
                                    return (
                                        <View key={c.value} style={styles.legendRow}>
                                            <View style={[styles.legendDot, { backgroundColor: categoryColors[c.value] }]} />
                                            <Icon name={c.iconKey} size={16} color={colors.icon} />
                                            <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: spacing.xs }]}>
                                                {c.label}
                                            </Text>
                                            <Text style={[typography.mono, { color: colors.textSecondary, marginRight: spacing.sm }]}>
                                                {pct}%
                                            </Text>
                                            <Text style={[typography.mono, { color: colors.text }]}>
                                                {value > 0 ? formatRupees(value) : '—'}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* ── Current balances (unfiltered by design) ── */}
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, shadows.low]}>
                            <Text style={[typography.title, { color: colors.text, marginBottom: spacing.xs }]}>
                                Your Balance
                            </Text>
                            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                                Current, across all groups — matches Settle Up.
                            </Text>
                            <View style={styles.balanceRow}>
                                <View style={styles.balanceCol}>
                                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                        You're owed
                                    </Text>
                                    <AmountText paise={totalOwedToMe} style={[typography.title, { color: colors.owed }]} />
                                </View>
                                <View style={[styles.balanceDivider, { backgroundColor: colors.separator }]} />
                                <View style={styles.balanceCol}>
                                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                        You owe
                                    </Text>
                                    <AmountText paise={totalIOwe} style={[typography.title, { color: colors.owe }]} />
                                </View>
                            </View>
                        </View>

                        {/* ── Top Groups ─────────────────────────────── */}
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, shadows.low]}>
                            <Text style={[typography.title, { color: colors.text, marginBottom: spacing.md }]}>
                                Top Groups
                            </Text>
                            {groupRows.map((g) => (
                                <View key={g.tripId} style={styles.groupRow}>
                                    <View style={styles.groupInfo}>
                                        <Text style={[typography.bodyMd, { color: colors.text }]} numberOfLines={1}>
                                            {g.name}
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                            {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                                        </Text>
                                    </View>
                                    <View style={styles.groupAmountCol}>
                                        <Text style={[typography.mono, { color: colors.text }]}>
                                            {formatRupees(g.total)}
                                        </Text>
                                        <ProgressBar
                                            value={g.total / maxGroupTotal}
                                            height={5}
                                            style={styles.groupBar}
                                        />
                                    </View>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { padding: spacing.md, paddingBottom: 120 },

    filterRow: {
        flexDirection: 'row',
        borderRadius: radii.full,
        padding: 3,
        marginBottom: spacing.md,
    },
    filterBtn: {
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: radii.full,
        alignItems: 'center',
    },

    heroCard: {
        borderRadius: radii.lg,
        borderWidth: 1,
        padding: spacing.lg,
        marginBottom: spacing.md,
        gap: spacing.xs,
    },
    card: {
        borderRadius: radii.lg,
        borderWidth: 1,
        padding: spacing.md,
        marginBottom: spacing.md,
    },

    legend: { marginTop: spacing.lg, gap: spacing.sm },
    legendRow: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },

    balanceRow: { flexDirection: 'row', alignItems: 'center' },
    balanceCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
    balanceDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },

    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        gap: spacing.md,
    },
    groupInfo: { flex: 1, minWidth: 0 },
    groupAmountCol: { width: 120, alignItems: 'flex-end', gap: spacing.xs },
    groupBar: { alignSelf: 'stretch' },
});