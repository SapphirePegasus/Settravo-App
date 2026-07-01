/**
 * app/(trip)/[tripId]/add-expense.tsx — Add / Edit Expense
 *
 * All emoji replaced:
 *   CATEGORIES[].icon (emoji) → iconKey (IconKey) passed to <Chip iconKey />
 *   🌐 offline banner → <Icon name="status.offline" />
 *   ✓ split balanced → <Icon name="action.check" />
 *   🗑 delete button → <Icon name="action.delete" />
 *   👤 guest indicator → <Icon name="status.guest" />
 */

import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmModal } from '../../../components/modals/ConfirmModal';
import { Avatar } from '../../../components/ui/Avatar';
import { Chip } from '../../../components/ui/Chip';
import { Icon } from '../../../components/ui/Icon';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { useToast } from '../../../components/Toast';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useMembers } from '../../../hooks/useMembers';
import {
    addExpenseWithSplits,
    deleteExpense,
    editExpense,
} from '../../../services/expenseService';
import { useAuthStore } from '../../../stores/authStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useExpenseStore } from '../../../stores/expenseStore';
import { useTripStore } from '../../../stores/tripStore';
import type { ExpenseCategory, Split } from '../../../types/domain';
import type { IconKey } from '../../../config/icons';
import { formatRupees, parseRupeesToPaise, splitEvenly } from '../../../utils/money';
import { validateSplitTotal } from '../../../validation/schemas';
import { spacing, typography, radii } from '@/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { label: string; value: ExpenseCategory; iconKey: IconKey }[] = [
    { label: 'Food', value: 'food', iconKey: 'category.food' },
    { label: 'Transport', value: 'transport', iconKey: 'category.transport' },
    { label: 'Stay', value: 'stay', iconKey: 'category.stay' },
    { label: 'Others', value: 'misc', iconKey: 'category.others' },
];

const EMPTY_SPLITS: Split[] = [];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AddExpenseScreen() {
    const { tripId, expenseId } = useLocalSearchParams<{ tripId: string; expenseId?: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const isEditMode = Boolean(expenseId);

    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const addExpenseOptimistic = useExpenseStore((s) => s.addExpenseOptimistic);
    const confirmExpense = useExpenseStore((s) => s.confirmExpense);
    const setExpensesInStore = useExpenseStore((s) => s.setExpenses);
    const setSplitsInStore = useExpenseStore((s) => s.setSplits);
    const enqueueOfflineItem = useTripStore((s) => s.enqueueOfflineItem);

    const existingExpense = useExpenseStore((s) => {
        if (!isEditMode || !tripId || !expenseId) return null;
        return (s.expenses[tripId] ?? []).find((e) => e.id === expenseId) ?? null;
    });
    const existingSplits = useExpenseStore(
        (s) => (expenseId ? s.splits[expenseId] ?? EMPTY_SPLITS : EMPTY_SPLITS),
    );

    const members = useMembers(tripId ?? '');

    const [title, setTitle] = useState('');
    const [amountStr, setAmountStr] = useState('');
    const [category, setCategory] = useState<ExpenseCategory | null>(null);
    const [paidByMemberId, setPaidByMemberId] = useState<string | null>(null);
    const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
    const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteVisible, setDeleteVisible] = useState(false);

    useEffect(() => {
        if (!isEditMode || !existingExpense) return;
        setTitle(existingExpense.title);
        setAmountStr((existingExpense.amountMoney / 100).toFixed(2));
        setCategory(existingExpense.category ?? null);
        setPaidByMemberId(existingExpense.paidByMember);
        if (existingSplits.length > 0) {
            const seeded: Record<string, string> = {};
            for (const sp of existingSplits) {
                seeded[sp.memberId] = (sp.shareMoney / 100).toFixed(2);
            }
            setCustomSplits(seeded);
            setSplitMode('custom');
        }
    }, [expenseId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (isEditMode || paidByMemberId || !deviceUser?.id) return;
        const mine = members.find((m) => m.deviceId === deviceUser.id);
        if (mine) setPaidByMemberId(mine.id);
    }, [isEditMode, members, deviceUser?.id, paidByMemberId]);

    const amountPaise = useMemo(() => parseRupeesToPaise(amountStr), [amountStr]);

    const equalSplits = useMemo((): Record<string, number> => {
        if (!amountPaise || members.length === 0) return {};
        const shares = splitEvenly(amountPaise, members.length);
        return Object.fromEntries(members.map((m, i) => [m.id, shares[i] ?? 0]));
    }, [amountPaise, members]);

    const finalSplits = useMemo((): Record<string, number> => {
        if (splitMode === 'equal') return equalSplits;
        const result: Record<string, number> = {};
        for (const m of members) {
            result[m.id] = parseRupeesToPaise(customSplits[m.id] ?? '0') ?? 0;
        }
        return result;
    }, [splitMode, equalSplits, members, customSplits]);

    const splitTotal = useMemo(
        () => Object.values(finalSplits).reduce((s, v) => s + v, 0),
        [finalSplits],
    );

    const splitProgress = amountPaise && amountPaise > 0 ? splitTotal / amountPaise : 0;

    const isValid = Boolean(
        title.trim() &&
        amountPaise != null && amountPaise > 0 &&
        paidByMemberId &&
        (amountPaise === splitTotal),
    );

    const myMember = members.find((m) => m.deviceId === deviceUser?.id);
    if (isEditMode && existingExpense && myMember &&
        existingExpense.paidByMember !== myMember.id) {
        return (
            <View style={[styles.guard, { backgroundColor: colors.bg }]}>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Only the payer can edit this expense.
                </Text>
            </View>
        );
    }

    const handleSubmit = useCallback(async () => {
        if (!tripId || !paidByMemberId || !amountPaise) return;
        setError(null);

        const splitEntries = Object.entries(finalSplits).map(([memberId, shareMoney]) => ({
            memberId, shareMoney,
        }));

        try {
            validateSplitTotal(splitEntries, amountPaise);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Split total mismatch');
            return;
        }

        if (isEditMode && existingExpense) {
            if (!networkOnline) {
                await enqueueOfflineItem({
                    type: 'EDIT_EXPENSE', localId: Crypto.randomUUID(),
                    retryCount: 0, lastFailedAt: null,
                    payload: {
                        id: existingExpense.id,
                        title: title.trim(), category,
                        amountMoney: amountPaise, paidByMember: paidByMemberId,
                    },
                });
                showToast({ message: 'Changes queued — will sync when online', variant: 'info' });
                router.back();
                return;
            }
            setLoading(true);
            try {
                const updated = await editExpense(
                    { id: existingExpense.id, title: title.trim(), category, amountMoney: amountPaise, paidByMember: paidByMemberId },
                    { splits: splitEntries },
                );
                const currentList = useExpenseStore.getState().expenses[tripId] ?? [];
                setExpensesInStore(tripId, currentList.map((e) => (e.id === updated.id ? updated : e)));
                setSplitsInStore(updated.id, splitEntries.map((s, i) => ({
                    id: `${updated.id}-${i}`, expenseId: updated.id,
                    memberId: s.memberId, shareMoney: s.shareMoney, isSettled: false,
                })));
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast({ message: 'Expense updated', variant: 'success' });
                router.back();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not update expense.');
            } finally {
                setLoading(false);
            }
            return;
        }

        const localId = Crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const tempExpense = {
            id: localId, tripId: tripId!, paidByMember: paidByMemberId!,
            title: title.trim(), category, amountMoney: amountPaise!,
            createdAt: nowIso, updatedAt: nowIso, isPendingSync: !networkOnline,
        };

        addExpenseOptimistic(tripId, tempExpense);

        if (!networkOnline) {
            await enqueueOfflineItem({
                type: 'ADD_EXPENSE', localId, retryCount: 0, lastFailedAt: null,
                payload: {
                    tripId: tripId!, paidByMember: paidByMemberId!, title: title.trim(),
                    category, amountMoney: amountPaise!,
                },
                splits: splitEntries,
            });
            showToast({ message: 'Expense saved — will sync when online', variant: 'info' });
            router.back();
            return;
        }

        setLoading(true);
        try {
            const { expense: saved, splits: savedSplits } = await addExpenseWithSplits(
                { tripId: tripId!, paidByMember: paidByMemberId!, title: title.trim(), category, amountMoney: amountPaise! },
                { splits: splitEntries },
            );
            confirmExpense(tripId, localId, saved);
            setSplitsInStore(saved.id, savedSplits);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast({ message: 'Expense added', variant: 'success' });
            router.back();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save expense.');
        } finally {
            setLoading(false);
        }
    }, [
        tripId, paidByMemberId, amountPaise, finalSplits, title, category,
        isEditMode, existingExpense, networkOnline,
        addExpenseOptimistic, confirmExpense, setExpensesInStore, setSplitsInStore,
        enqueueOfflineItem, showToast, router,
    ]);

    const handleDelete = useCallback(async () => {
        if (!existingExpense || !tripId) return;
        setLoading(true);
        try {
            await deleteExpense(existingExpense.id);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            showToast({ message: 'Expense deleted', variant: 'success' });
            router.back();
        } catch (err) {
            showToast({ message: err instanceof Error ? err.message : 'Could not delete.', variant: 'error' });
        } finally {
            setLoading(false);
            setDeleteVisible(false);
        }
    }, [existingExpense, tripId, showToast, router]);

    const screenTitle = isEditMode ? 'Edit Expense' : 'Add Expense';

    return (
        <SafeAreaView style={[styles.screenRoot, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
            {/* Modal header — close button left, title center */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
                <Pressable
                    style={styles.modalHeaderBtn}
                    onPress={() => router.back()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                >
                    <Icon name="action.close" size={22} color={colors.text} />
                </Pressable>
                <Text style={[typography.bodyMd, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                    {screenTitle}
                </Text>
                <View style={styles.modalHeaderBtn} />
            </View>

            <KeyboardAvoidingView
                style={[styles.root, { backgroundColor: colors.bg }]}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Offline banner */}
                    {!networkOnline && (
                        <View style={[styles.offlineBanner, { backgroundColor: colors.warningMuted }]}>
                            <Icon name="status.offline" size={14} color={colors.warning} />
                            <Text style={[typography.caption, { color: colors.warning }]}>
                                Offline — this {isEditMode ? 'change' : 'expense'} will sync when reconnected.
                            </Text>
                        </View>
                    )}

                    {/* Title */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>EXPENSE NAME *</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                        placeholder="e.g. Hotel checkout"
                        placeholderTextColor={colors.placeholder}
                        value={title}
                        onChangeText={(v) => { setTitle(v); setError(null); }}
                        maxLength={120}
                        autoCapitalize="sentences"
                        returnKeyType="next"
                        accessibilityLabel="Expense name"
                    />

                    {/* Amount */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>AMOUNT (₹) *</Text>
                    <View style={[styles.amountRow, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}>
                        <Text style={[styles.amountPrefix, { color: colors.textSecondary }]}>₹</Text>
                        <TextInput
                            style={[styles.amountInput, { color: colors.text }]}
                            placeholder="0.00"
                            placeholderTextColor={colors.placeholder}
                            value={amountStr}
                            onChangeText={(v) => { setAmountStr(v.replace(/[^0-9.]/g, '')); setError(null); }}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            accessibilityLabel="Amount in rupees"
                        />
                    </View>

                    {/* Category */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CATEGORY</Text>
                    <View style={styles.chipRow}>
                        {CATEGORIES.map((cat) => (
                            <Chip
                                key={cat.value}
                                label={cat.label}
                                iconKey={cat.iconKey}
                                selected={category === cat.value}
                                onPress={() => setCategory(category === cat.value ? null : cat.value)}
                            />
                        ))}
                    </View>

                    {/* Paid by */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>PAID BY *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paidByRow}>
                        {members.map((m) => {
                            const selected = paidByMemberId === m.id;
                            return (
                                <Pressable
                                    key={m.id}
                                    style={[
                                        styles.paidByChip,
                                        {
                                            backgroundColor: selected ? colors.accent : colors.card,
                                            borderColor: selected ? colors.accent : colors.cardBorder,
                                        },
                                    ]}
                                    onPress={() => setPaidByMemberId(m.id)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={`${m.displayName} paid`}
                                >
                                    <Avatar name={m.displayName} size={24} />
                                    <Text style={[typography.caption, { color: selected ? colors.textInverse : colors.text }]}>
                                        {m.displayName}
                                    </Text>
                                    {m.isGuest && (
                                        <Icon
                                            name="status.guest"
                                            size={12}
                                            color={selected ? colors.textInverse : colors.icon}
                                        />
                                    )}
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    {/* Split header */}
                    <View style={styles.splitHeader}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                            SPLIT
                        </Text>
                        <View style={styles.splitToggle}>
                            {(['equal', 'custom'] as const).map((mode) => (
                                <Pressable
                                    key={mode}
                                    style={[
                                        styles.toggleBtn,
                                        { backgroundColor: splitMode === mode ? colors.accent : colors.subSurface },
                                    ]}
                                    onPress={() => setSplitMode(mode)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: splitMode === mode }}
                                >
                                    <Text style={[typography.label, { color: splitMode === mode ? colors.textInverse : colors.textSecondary }]}>
                                        {mode === 'equal' ? 'EQUALLY' : 'CUSTOM'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {/* Progress bar */}
                    {amountPaise != null && amountPaise > 0 && (
                        <View style={styles.progressSection}>
                            <ProgressBar value={splitProgress} height={6} />
                            <View style={styles.splitStatusRow}>
                                {splitTotal === amountPaise ? (
                                    <Icon name="action.check" size={13} color={colors.success} />
                                ) : null}
                                <Text style={[typography.caption, {
                                    color: splitTotal === amountPaise ? colors.success : colors.textSecondary,
                                    marginTop: 4,
                                }]}>
                                    {splitTotal === amountPaise
                                        ? 'Split balanced'
                                        : `Remaining: ${formatRupees(Math.abs(amountPaise - splitTotal))}`}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Split rows */}
                    <View style={[styles.splitCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                        {members.map((m, index) => (
                            <View
                                key={m.id}
                                style={[
                                    styles.splitRow,
                                    index < members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                                ]}
                            >
                                <Avatar name={m.displayName} size="sm" />
                                <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: spacing.sm }]} numberOfLines={1}>
                                    {m.displayName}
                                </Text>
                                {splitMode === 'equal' ? (
                                    <Text style={[typography.mono, { color: colors.textSecondary }]}>
                                        {amountPaise ? formatRupees(equalSplits[m.id] ?? 0) : '—'}
                                    </Text>
                                ) : (
                                    <TextInput
                                        style={[styles.splitInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                                        placeholder="0"
                                        placeholderTextColor={colors.placeholder}
                                        value={customSplits[m.id] ?? ''}
                                        onChangeText={(v) => setCustomSplits((prev) => ({ ...prev, [m.id]: v.replace(/[^0-9.]/g, '') }))}
                                        keyboardType="decimal-pad"
                                        accessibilityLabel={`${m.displayName} split amount`}
                                    />
                                )}
                            </View>
                        ))}
                        {amountPaise != null && amountPaise > 0 && splitTotal !== amountPaise && splitTotal > 0 && (
                            <Text style={[typography.caption, { color: colors.danger, paddingTop: spacing.sm }]}>
                                Split total {formatRupees(splitTotal)} ≠ amount {formatRupees(amountPaise)}
                            </Text>
                        )}
                    </View>

                    {error ? (
                        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text>
                    ) : null}

                    {/* Delete button (edit mode only) */}
                    {isEditMode && (
                        <Pressable
                            style={[styles.deleteBtn, { borderColor: colors.danger }]}
                            onPress={() => setDeleteVisible(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Delete expense"
                        >
                            <Icon name="action.delete" size={18} color={colors.danger} />
                            <Text style={[typography.bodyMd, { color: colors.danger }]}>Delete Expense</Text>
                        </Pressable>
                    )}
                </ScrollView>

                {/* Submit footer */}
                <View style={[styles.footer, { borderTopColor: colors.separator, backgroundColor: colors.surface }]}>
                    <Pressable
                        style={[
                            styles.submitBtn,
                            { backgroundColor: isValid && !loading ? colors.accent : colors.separator },
                        ]}
                        onPress={handleSubmit}
                        disabled={!isValid || loading}
                        accessibilityRole="button"
                        accessibilityLabel={isEditMode ? 'Save changes' : 'Add expense'}
                        accessibilityState={{ disabled: !isValid || loading }}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.textInverse} />
                        ) : (
                            <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '600' }]}>
                                {isEditMode ? 'Save Changes' : networkOnline ? 'Add Expense' : 'Save Offline'}
                            </Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>

            <ConfirmModal
                visible={deleteVisible}
                title={`Delete "${existingExpense?.title ?? ''}"?`}
                message="This expense and its splits will be permanently removed. This cannot be undone."
                confirmLabel="Delete"
                confirmVariant="destructive"
                onConfirm={handleDelete}
                onCancel={() => setDeleteVisible(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    screenRoot: { flex: 1 },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    modalHeaderBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    offlineBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        borderRadius: radii.sm,
        padding: spacing.sm,
        marginBottom: spacing.md,
    },
    fieldLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
    input: {
        height: 52, borderRadius: radii.md, borderWidth: 1,
        paddingHorizontal: spacing.md, ...typography.body,
    },
    amountRow: {
        flexDirection: 'row', alignItems: 'center', height: 64,
        borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md,
    },
    amountPrefix: { ...typography.monoLg, marginRight: spacing.xs },
    amountInput: { flex: 1, ...typography.monoLg, paddingVertical: 0 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    paidByRow: { marginBottom: spacing.sm },
    paidByChip: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
        borderRadius: radii.full, borderWidth: 1,
        paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
        marginRight: spacing.sm,
    },
    splitHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: spacing.lg, marginBottom: spacing.md,
    },
    splitToggle: { flexDirection: 'row', gap: spacing.xs },
    toggleBtn: { borderRadius: radii.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
    progressSection: { marginBottom: spacing.md },
    splitStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    splitCard: {
        borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden', paddingHorizontal: spacing.md,
    },
    splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
    splitInput: {
        width: 80, height: 36, borderRadius: radii.sm, borderWidth: 1,
        paddingHorizontal: spacing.sm, ...typography.mono, textAlign: 'right',
    },
    deleteBtn: {
        marginTop: spacing.xl, height: 48, borderRadius: radii.md, borderWidth: 1.5,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    },
    footer: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
    submitBtn: { height: 56, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
});