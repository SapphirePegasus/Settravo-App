/**
 * app/(tabs)/statistics.tsx — Statistics (D.12)
 *
 * 4 sections:
 *   1. Time filter pills
 *   2. Summary stat cards (Total / Owed / Owe) + Net settlement
 *   3. Per-group breakdown with progress bars
 *   4. Spending by category — animated SVG horizontal bars
 *
 * Phase E: SVG category bars animate their fill width on mount using
 * Reanimated's AnimatedProps on a react-native-svg Rect. Each bar
 * is staggered by 80ms × its index.
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withDelay,
    withTiming,
    Easing,
} from 'react-native-reanimated';

import { Avatar } from '../../components/ui/Avatar';
import { AmountText } from '../../components/ui/AmountText';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuthStore } from '../../stores/authStore';
import { useExpenseStore } from '../../stores/expenseStore';
import { useMemberStore } from '../../stores/memberStore';
import { useTripStore } from '../../stores/tripStore';
import type { ExpenseCategory } from '../../types/domain';
import type { IconKey } from '../../config/icons';
import type { ThemeColors } from '../../hooks/useThemeColors';
import { typography, spacing, radii } from '@/theme';

// ─── Animated SVG component ───────────────────────────────────────────────────

/**
 * Animated.createAnimatedComponent must be called once at module scope,
 * not inside a render function. Calling it inside a component or render
 * creates a new class on every render which React will unmount+remount.
 */
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeFilter = 'month' | '3months' | 'all';

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
    { value: 'month', label: 'This Month' },
    { value: '3months', label: 'Last 3 Months' },
    { value: 'all', label: 'All Time' },
];

const CATEGORY_META: { value: ExpenseCategory; label: string; iconKey: IconKey }[] = [
    { value: 'food', label: 'Food', iconKey: 'category.food' },
    { value: 'transport', label: 'Transport', iconKey: 'category.transport' },
    { value: 'stay', label: 'Stay', iconKey: 'category.stay' },
    { value: 'misc', label: 'Others', iconKey: 'category.others' },
];

const BAR_CHART_WIDTH = 200;
const BAR_HEIGHT = 20;

// ─── Animated category bar ───────────────────────────────────────────────────

interface AnimatedCategoryBarProps {
    cat: (typeof CATEGORY_META)[number];
    value: number;
    targetBarWidth: number;
    /** Stagger index — each bar starts 80ms later than the previous. */
    index: number;
    colors: ThemeColors;
}

/**
 * One SVG row in the category chart. The fill rect animates from 0 to
 * targetBarWidth on mount using Reanimated's useAnimatedProps + withDelay.
 *
 * NOTE: useAnimatedProps requires that the prop it drives (width) is NOT
 * set via a regular style or prop — it must flow exclusively through
 * animatedProps. The background rect uses a plain Rect (not animated) to
 * avoid unnecessary worklet overhead for a static element.
 */
function AnimatedCategoryBar({ cat, value, targetBarWidth, index, colors }: AnimatedCategoryBarProps) {
    const width = useSharedValue(0);

    useEffect(() => {
        width.value = withDelay(
            index * 80,
            withTiming(Math.max(targetBarWidth, targetBarWidth > 0 ? 2 : 0), {
                duration: 500,
                easing: Easing.out(Easing.cubic),
            }),
        );
    }, [targetBarWidth, index, width]);

    const animatedProps = useAnimatedProps(() => ({
        width: width.value,
    }));

    return (
        <View style={styles.categoryRow}>
            <View style={styles.categoryIconWrap}>
                <Icon name={cat.iconKey} size={18} color={colors.icon} />
            </View>
            <Text style={[typography.body, { color: colors.text, width: 72 }]}>
                {cat.label}
            </Text>
            <Svg width={BAR_CHART_WIDTH} height={BAR_HEIGHT}>
                {/* Background track */}
                <Rect
                    x={0} y={2}
                    width={BAR_CHART_WIDTH} height={BAR_HEIGHT - 4}
                    rx={4}
                    fill={colors.separator}
                />
                {/* Animated fill */}
                <AnimatedRect
                    x={0} y={2}
                    height={BAR_HEIGHT - 4}
                    rx={4}
                    fill={colors.accent}
                    animatedProps={animatedProps}
                />
            </Svg>
            <Text style={[typography.mono, { color: colors.textSecondary, marginLeft: spacing.sm, width: 52 }]}>
                {value > 0 ? `₹${(value / 100).toFixed(0)}` : '—'}
            </Text>
        </View>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWithinFilter(dateIso: string, filter: TimeFilter): boolean {
    if (filter === 'all') return true;
    const date = new Date(dateIso);
    const now = new Date();
    if (filter === 'month') {
        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
        );
    }
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    return date >= threeMonthsAgo;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatisticsScreen() {
    const router = useRouter();
    const colors = useThemeColors();
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const trips = useTripStore((s) => s.trips);
    const allExpenses = useExpenseStore((s) => s.expenses);
    const allSplits = useExpenseStore((s) => s.splits);
    const allMembers = useMemberStore((s) => s.members);

    const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');

    const filteredByTrip = useMemo(() => {
        const result: Record<string, typeof allExpenses[string]> = {};
        for (const [tripId, list] of Object.entries(allExpenses)) {
            result[tripId] = list.filter((e) => isWithinFilter(e.createdAt, timeFilter));
        }
        return result;
    }, [allExpenses, timeFilter]);

    const { totalSpent, totalOwed, totalOwe } = useMemo(() => {
        let spent = 0, owed = 0, owe = 0;
        const flatSplits = Object.values(allSplits).flat();
        for (const list of Object.values(filteredByTrip)) {
            for (const exp of list) {
                spent += exp.amountMoney;
                const mySplit = flatSplits.find(
                    (sp) => sp.expenseId === exp.id && sp.memberId === deviceUser?.id,
                );
                if (mySplit && !mySplit.isSettled) {
                    if (exp.paidByMember === deviceUser?.id) {
                        owed += exp.amountMoney - mySplit.shareMoney;
                    } else {
                        owe += mySplit.shareMoney;
                    }
                }
            }
        }
        return { totalSpent: spent, totalOwed: owed, totalOwe: owe };
    }, [filteredByTrip, allSplits, deviceUser?.id]);

    const netSettlement = totalOwed - totalOwe;

    const groupBreakdown = useMemo(() => {
        return trips.map((trip) => {
            const list = filteredByTrip[trip.id] ?? [];
            const tripTotal = list.reduce((s, e) => s + e.amountMoney, 0);
            const members = allMembers[trip.id] ?? [];
            const flatSplits = Object.values(allSplits).flat();
            let myNet = 0;
            let mySpend = 0;
            for (const exp of list) {
                if (exp.paidByMember === deviceUser?.id) mySpend += exp.amountMoney;
                const mySplit = flatSplits.find(
                    (sp) => sp.expenseId === exp.id && sp.memberId === deviceUser?.id,
                );
                if (mySplit && !mySplit.isSettled) {
                    if (exp.paidByMember === deviceUser?.id) {
                        myNet += exp.amountMoney - mySplit.shareMoney;
                    } else {
                        myNet -= mySplit.shareMoney;
                    }
                }
            }
            return {
                tripId: trip.id,
                name: trip.name,
                memberCount: members.length,
                total: tripTotal,
                myNet,
                spendRatio: tripTotal > 0 ? mySpend / tripTotal : 0,
            };
        }).filter((g) => g.total > 0);
    }, [trips, filteredByTrip, allSplits, allMembers, deviceUser?.id]);

    const categoryTotals = useMemo(() => {
        const totals: Record<string, number> = { food: 0, transport: 0, stay: 0, misc: 0 };
        for (const list of Object.values(filteredByTrip)) {
            for (const exp of list) {
                const cat = exp.category ?? 'misc';
                totals[cat] = (totals[cat] ?? 0) + exp.amountMoney;
            }
        }
        return totals;
    }, [filteredByTrip]);

    const maxCategoryValue = Math.max(...Object.values(categoryTotals), 1);
    const hasAnyData = totalSpent > 0;

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: colors.bg }]}
            edges={['top', 'left', 'right']}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.content}
            >
                <Text style={[typography.heading, { color: colors.text, marginBottom: spacing.md }]}>
                    Statistics
                </Text>

                {/* ── Time filter ──────────────────────────────────────── */}
                <View style={styles.filterRow}>
                    {TIME_FILTERS.map((f) => (
                        <Pressable
                            key={f.value}
                            style={[
                                styles.filterBtn,
                                {
                                    backgroundColor:
                                        timeFilter === f.value ? colors.accent : colors.subSurface,
                                },
                            ]}
                            onPress={() => setTimeFilter(f.value)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: timeFilter === f.value }}
                        >
                            <Text
                                style={[
                                    typography.caption,
                                    {
                                        color: timeFilter === f.value
                                            ? colors.textInverse
                                            : colors.textSecondary,
                                        fontWeight: '600',
                                    },
                                ]}
                            >
                                {f.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {!hasAnyData ? (
                    <EmptyState
                        iconKey="nav.statistics"
                        title="No data for this period"
                        subtitle="Add some expenses to see your statistics here."
                    />
                ) : (
                    <>
                        {/* ── Summary cards ────────────────────────────── */}
                        <View style={styles.summaryRow}>
                            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                                <Text style={[typography.label, { color: colors.textSecondary }]}>TOTAL SPENT</Text>
                                <AmountText paise={totalSpent} sign="neutral" size="lg" />
                            </View>
                            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                                <Text style={[typography.label, { color: colors.textSecondary }]}>OWED TO YOU</Text>
                                <AmountText paise={totalOwed} sign="positive" size="lg" />
                            </View>
                            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                                <Text style={[typography.label, { color: colors.textSecondary }]}>YOU OWE</Text>
                                <AmountText paise={totalOwe} sign="negative" size="lg" />
                            </View>
                        </View>

                        {/* Net settlement */}
                        <View style={[styles.netCard, { backgroundColor: colors.accentLight }]}>
                            <Text style={[typography.label, { color: colors.accent }]}>
                                NET SETTLEMENT LEFT
                            </Text>
                            <AmountText paise={Math.abs(netSettlement)} sign="neutral" size="lg" style={{ color: colors.accent } as object} />
                            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                                {netSettlement >= 0
                                    ? 'Net amount others owe you'
                                    : 'Net amount you owe'}
                            </Text>
                        </View>

                        {/* ── Per-group breakdown ───────────────────────── */}
                        <Text style={[typography.bodyMd, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md }]}>
                            Per-Group Breakdown
                        </Text>
                        <View style={styles.groupList}>
                            {groupBreakdown.map((g) => (
                                <Pressable
                                    key={g.tripId}
                                    style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                                    onPress={() => router.push(`/(trip)/${g.tripId}`)}
                                    accessibilityRole="button"
                                >
                                    <View style={styles.groupHeader}>
                                        <Avatar name={g.name} size="lg" />
                                        <View style={styles.groupInfo}>
                                            <Text style={[typography.bodyMd, { color: colors.text }]} numberOfLines={1}>
                                                {g.name}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                                {g.memberCount} members
                                            </Text>
                                        </View>
                                        <AmountText paise={g.myNet} sign="auto" size="md" />
                                    </View>
                                    <ProgressBar
                                        value={g.spendRatio}
                                        height={5}
                                        style={{ marginTop: spacing.sm }}
                                    />
                                </Pressable>
                            ))}
                        </View>

                        {/* ── Spending by category — animated ──────────── */}
                        <Text style={[typography.bodyMd, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md }]}>
                            Spending by Category
                        </Text>
                        <View style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                            {CATEGORY_META.map((cat, catIndex) => {
                                const value = categoryTotals[cat.value] ?? 0;
                                const targetBarWidth = (value / maxCategoryValue) * BAR_CHART_WIDTH;
                                return (
                                    <AnimatedCategoryBar
                                        key={cat.value}
                                        cat={cat}
                                        value={value}
                                        targetBarWidth={targetBarWidth}
                                        index={catIndex}
                                        colors={colors}
                                    />
                                );
                            })}
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
    content: { padding: spacing.md, paddingBottom: spacing.xxl },

    filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    filterBtn: {
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: radii.sm,
        alignItems: 'center',
    },

    summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    summaryCard: {
        flex: 1,
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: StyleSheet.hairlineWidth,
        gap: spacing.xs,
    },
    netCard: {
        padding: spacing.lg,
        borderRadius: radii.lg,
        alignItems: 'center',
        gap: spacing.xs,
    },

    groupList: { gap: spacing.sm },
    groupCard: {
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    groupInfo: { flex: 1, gap: 2 },

    categoryCard: {
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        gap: spacing.md,
    },
    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    categoryIconWrap: { width: 24, alignItems: 'center' },
});