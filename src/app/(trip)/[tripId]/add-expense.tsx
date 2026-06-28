/**
 * add-expense.tsx
 *
 * Unified Add / Edit expense screen.
 *
 * Mode is determined by the presence of `expenseId` in route params:
 *  - No expenseId  → Add mode: blank form, calls addExpenseWithSplits()
 *  - Has expenseId → Edit mode: pre-seeded form, calls editExpense()
 *
 * This is the industry-standard pattern — one parameterised screen
 * rather than two near-identical screens. Single source of truth for
 * all expense form logic: validation, split calculation, offline queuing.
 *
 * Offline behaviour:
 *  - Add offline  → enqueue ADD_EXPENSE (with splits)
 *  - Edit offline → enqueue EDIT_EXPENSE
 *  Both are replayed by useOfflineSync on reconnect.
 *
 * Ownership guard:
 *  - Edit mode checks currentMember === expense.paidByMember before rendering.
 *  - RLS enforces this server-side regardless.
 */

import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
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
import { ConfirmModal } from '../../../components/modals/ConfirmModal';
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
import type { ExpenseCategory } from '../../../types/domain';
import { formatRupees, parseRupeesToPaise, splitEvenly } from '../../../utils/money';
import { validateSplitTotal } from '../../../validation/schemas';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { label: string; value: ExpenseCategory }[] = [
    { label: '🍽 Food', value: 'food' },
    { label: '🚗 Transport', value: 'transport' },
    { label: '🏨 Stay', value: 'stay' },
    { label: '📦 Misc', value: 'misc' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AddExpenseScreen() {
    const { tripId, expenseId } = useLocalSearchParams<{
        tripId: string;
        expenseId?: string;
    }>();
    const router = useRouter();
    const navigation = useNavigation();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const isEditMode = Boolean(expenseId);

    // ── Store selectors ───────────────────────────────────────────────────────
    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const addExpenseOptimistic = useExpenseStore((s) => s.addExpenseOptimistic);
    const confirmExpense = useExpenseStore((s) => s.confirmExpense);
    const applyExpensePatch = useExpenseStore((s) => s.applyExpensePatch);
    const setSplitsInStore = useExpenseStore((s) => s.setSplits);
    const enqueueOfflineItem = useTripStore((s) => s.enqueueOfflineItem);

    // In edit mode — load the existing expense from the store (already fetched
    // by the trip detail screen; no extra network call needed).
    const existingExpense = useExpenseStore(
        (s) =>
            isEditMode && tripId && expenseId
                ? (s.expenses[tripId] ?? []).find((e) => e.id === expenseId) ?? null
                : null,
    );
    const existingSplits = useExpenseStore(
        (s) => (expenseId ? (s.splits[expenseId] ?? []) : []),
    );

    const members = useMembers(tripId ?? '');

    // ── Form state ────────────────────────────────────────────────────────────
    const [title, setTitle] = useState('');
    const [amountStr, setAmountStr] = useState('');
    const [category, setCategory] = useState<ExpenseCategory | null>(null);
    const [paidByMemberId, setPaidByMemberId] = useState<string | null>(null);
    const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
    const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteVisible, setDeleteVisible] = useState(false);

    // ── Dynamic header title ──────────────────────────────────────────────────
    useEffect(() => {
        navigation.setOptions({ title: isEditMode ? 'Edit Expense' : 'Add Expense' });
    }, [isEditMode, navigation]);

    // ── Seed form in edit mode ────────────────────────────────────────────────
    // Runs once when expenseId becomes available. Uses existingExpense from
    // store — no network call required.
    useEffect(() => {
        if (!isEditMode || !existingExpense) return;

        setTitle(existingExpense.title);
        setAmountStr((existingExpense.amountMoney / 100).toFixed(2));
        setCategory(existingExpense.category ?? null);
        setPaidByMemberId(existingExpense.paidByMember);

        // Seed custom splits from stored split records
        if (existingSplits.length > 0) {
            const seeded: Record<string, string> = {};
            for (const sp of existingSplits) {
                seeded[sp.memberId] = (sp.shareMoney / 100).toFixed(2);
            }
            setCustomSplits(seeded);
            setSplitMode('custom');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenseId]); // re-seed only if the expenseId itself changes

    // ── Auto-select current user as payer (add mode only) ────────────────────
    useEffect(() => {
        if (isEditMode || paidByMemberId || !deviceUser?.id) return;
        const myMember = members.find((m) => m.deviceId === deviceUser.id);
        if (myMember) setPaidByMemberId(myMember.id);
    }, [isEditMode, members, deviceUser?.id, paidByMemberId]);

    // ── Derived values ────────────────────────────────────────────────────────
    const amountPaise = useMemo(
        () => parseRupeesToPaise(amountStr),
        [amountStr],
    );

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
    }, [splitMode, equalSplits, customSplits, members]);

    const splitTotal = useMemo(
        () => Object.values(finalSplits).reduce((a, b) => a + b, 0),
        [finalSplits],
    );

    const isValid =
        title.trim().length > 0 &&
        amountPaise !== null &&
        amountPaise > 0 &&
        paidByMemberId !== null &&
        splitTotal === amountPaise &&
        members.length > 0;

    // ── Ownership guard (edit mode) ───────────────────────────────────────────
    const myMember = members.find((m) => m.deviceId === deviceUser?.id);

    const isOwner =
        !isEditMode ||
        (existingExpense != null && existingExpense.paidByMember === myMember?.id);

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!isValid || !tripId || !paidByMemberId || !amountPaise) return;
        setError(null);

        const splitEntries = Object.entries(finalSplits).map(([memberId, shareMoney]) => ({
            memberId,
            shareMoney,
        }));

        try {
            validateSplitTotal(splitEntries, amountPaise);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Split total mismatch');
            return;
        }

        // ── EDIT path ─────────────────────────────────────────────────────────
        if (isEditMode && existingExpense) {
            if (!networkOnline) {
                await enqueueOfflineItem({
                    type: 'EDIT_EXPENSE',
                    localId: Crypto.randomUUID(),
                    retryCount: 0,
                    lastFailedAt: null,
                    payload: {
                        id: existingExpense.id,
                        title: title.trim(),
                        category,
                        amountMoney: amountPaise,
                        paidByMember: paidByMemberId,
                    },
                });
                showToast({ message: 'Changes queued — will sync when online', variant: 'info' });
                router.back();
                return;
            }

            setLoading(true);
            try {
                const updated = await editExpense(
                    {
                        id: existingExpense.id,
                        title: title.trim(),
                        category,
                        amountMoney: amountPaise,
                        paidByMember: paidByMemberId,
                    },
                    { splits: splitEntries },
                );

                // Patch expenseStore so the list updates without waiting for realtime
                applyExpensePatch(tripId, {
                    eventType: 'UPDATE',
                    new: {
                        id: updated.id,
                        trip_id: updated.tripId,
                        paid_by_member: updated.paidByMember,
                        title: updated.title,
                        category: updated.category ?? null,
                        amount_money: updated.amountMoney,
                        created_at: updated.createdAt,
                        updated_at: updated.updatedAt,
                    },
                    old: {},
                    schema: 'public',
                    table: 'TravelAppExpenses',
                    commit_timestamp: '',
                    errors: [],
                });

                // Refresh splits in store with what we sent (server may re-order IDs
                // via realtime shortly after, which is fine — the amounts are correct)
                setSplitsInStore(
                    existingExpense.id,
                    splitEntries.map((s, i) => ({
                        id: `optimistic-${i}`,
                        expenseId: existingExpense.id,
                        memberId: s.memberId,
                        shareMoney: s.shareMoney,
                        isSettled: false,
                    })),
                );

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast({ message: 'Expense updated', variant: 'success' });
                router.back();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to save changes.');
            } finally {
                setLoading(false);
            }
            return;
        }

        // ── ADD path ──────────────────────────────────────────────────────────
        const localId = Crypto.randomUUID();
        const now = new Date().toISOString();

        addExpenseOptimistic(tripId, {
            id: localId,
            tripId,
            paidByMember: paidByMemberId,
            title: title.trim(),
            category,
            amountMoney: amountPaise,
            createdAt: now,
            updatedAt: now,
            isPendingSync: !networkOnline,
        });

        if (!networkOnline) {
            await enqueueOfflineItem({
                type: 'ADD_EXPENSE',
                localId,
                retryCount: 0,
                lastFailedAt: null,
                payload: {
                    tripId,
                    paidByMember: paidByMemberId,
                    title: title.trim(),
                    category,
                    amountMoney: amountPaise,
                    isPendingSync: true,
                },
                splits: splitEntries,
            });
            router.back();
            return;
        }

        setLoading(true);
        try {
            const { expense } = await addExpenseWithSplits(
                {
                    tripId,
                    paidByMember: paidByMemberId,
                    title: title.trim(),
                    category,
                    amountMoney: amountPaise,
                },
                { splits: splitEntries },
            );
            confirmExpense(tripId, localId, expense);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast({ message: 'Expense added', variant: 'success' });
            router.back();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save expense.');
            setLoading(false);
        }
    }, [
        isValid, tripId, paidByMemberId, amountPaise, title, category,
        finalSplits,
        isEditMode, existingExpense, networkOnline,
        addExpenseOptimistic, confirmExpense, applyExpensePatch,
        setSplitsInStore, enqueueOfflineItem, showToast, router,
    ]);

    // ── Delete (edit mode only) ───────────────────────────────────────────────
    const handleDelete = useCallback(async () => {
        if (!existingExpense || !tripId) return;
        try {
            await deleteExpense(existingExpense.id);
            // removeExpense is handled by the realtime DELETE patch on the parent screen
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            showToast({ message: 'Expense deleted', variant: 'info' });
            router.back();
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : 'Could not delete expense.',
                variant: 'error',
            });
        }
    }, [existingExpense, tripId, showToast, router]);

    // ── Guards ────────────────────────────────────────────────────────────────
    if (isEditMode && !existingExpense) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.accent} />
            </View>
        );
    }

    if (isEditMode && !isOwner) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <Text style={[styles.guardText, { color: colors.subText }]}>
                    Only the person who paid can edit this expense.
                </Text>
            </View>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
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
                        <View style={[styles.offlineBanner, { backgroundColor: colors.warningBg }]}>
                            <Text style={[styles.offlineBannerText, { color: colors.warningText }]}>
                                Offline — {isEditMode ? 'changes' : 'expense'} will sync when reconnected.
                            </Text>
                        </View>
                    )}

                    {/* Title */}
                    <Text style={[styles.label, { color: colors.subText }]}>What was it for? *</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.inputBorder,
                        }]}
                        placeholder="e.g. Hotel checkout"
                        placeholderTextColor={colors.placeholder}
                        value={title}
                        onChangeText={(v) => { setTitle(v); setError(null); }}
                        maxLength={120}
                        autoCapitalize="sentences"
                        returnKeyType="next"
                    />

                    {/* Amount */}
                    <Text style={[styles.label, { color: colors.subText }]}>Amount (₹) *</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.inputBorder,
                        }]}
                        placeholder="0.00"
                        placeholderTextColor={colors.placeholder}
                        value={amountStr}
                        onChangeText={(v) => { setAmountStr(v.replace(/[^0-9.]/g, '')); setError(null); }}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                    />

                    {/* Category */}
                    <Text style={[styles.label, { color: colors.subText }]}>Category</Text>
                    <View style={styles.chipRow}>
                        {CATEGORIES.map((cat) => {
                            const selected = category === cat.value;
                            return (
                                <Pressable
                                    key={cat.value}
                                    style={[
                                        styles.chip,
                                        {
                                            backgroundColor: selected ? colors.accent : colors.cardElevated,
                                            borderColor: selected ? colors.accent : colors.inputBorder,
                                        },
                                    ]}
                                    onPress={() => setCategory(selected ? null : cat.value)}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: selected }}
                                >
                                    <Text style={[styles.chipText, { color: selected ? '#fff' : colors.text }]}>
                                        {cat.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Paid by */}
                    <Text style={[styles.label, { color: colors.subText }]}>Paid by *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {members.map((m) => {
                            const selected = paidByMemberId === m.id;
                            return (
                                <Pressable
                                    key={m.id}
                                    style={[
                                        styles.memberChip,
                                        {
                                            backgroundColor: selected ? colors.accent : colors.card,
                                            marginRight: 8,
                                        },
                                    ]}
                                    onPress={() => setPaidByMemberId(m.id)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                >
                                    <Text style={[styles.memberChipText, { color: selected ? '#fff' : colors.text }]}>
                                        {m.displayName}{m.isGuest ? ' 👤' : ''}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    {/* Split mode toggle */}
                    <View style={styles.splitHeader}>
                        <Text style={[styles.label, { color: colors.subText, marginBottom: 0, marginTop: 0 }]}>
                            Split
                        </Text>
                        <View style={styles.splitToggle}>
                            {(['equal', 'custom'] as const).map((mode) => (
                                <Pressable
                                    key={mode}
                                    style={[
                                        styles.toggleBtn,
                                        { backgroundColor: splitMode === mode ? colors.accent : colors.card },
                                    ]}
                                    onPress={() => setSplitMode(mode)}
                                >
                                    <Text style={[
                                        styles.toggleText,
                                        { color: splitMode === mode ? '#fff' : colors.text },
                                    ]}>
                                        {mode === 'equal' ? 'Equal' : 'Custom'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {/* Split progress bar */}
                    {amountPaise != null && amountPaise > 0 && (
                        <View style={[styles.progressBarBg, { backgroundColor: colors.bg }]}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        backgroundColor:
                                            splitTotal === amountPaise
                                                ? colors.accentSuccess
                                                : splitTotal > amountPaise
                                                    ? colors.accentDestructive
                                                    : colors.accent,
                                        width: `${Math.min((splitTotal / amountPaise) * 100, 100)}%`,
                                    },
                                ]}
                            />
                        </View>
                    )}

                    {/* Split rows */}
                    <View style={[styles.splitCard, { backgroundColor: colors.card }]}>
                        {members.map((m) => (
                            <View key={m.id} style={styles.splitRow}>
                                <Text style={[styles.splitName, { color: colors.text }]} numberOfLines={1}>
                                    {m.displayName}
                                </Text>
                                {splitMode === 'equal' ? (
                                    <Text style={[styles.splitAmount, { color: colors.subText }]}>
                                        {amountPaise ? formatRupees(equalSplits[m.id] ?? 0) : '—'}
                                    </Text>
                                ) : (
                                    <TextInput
                                        style={[styles.splitInput, {
                                            backgroundColor: colors.inputBg,
                                            color: colors.text,
                                            borderColor: colors.inputBorder,
                                        }]}
                                        placeholder="0"
                                        placeholderTextColor={colors.placeholder}
                                        value={customSplits[m.id] ?? ''}
                                        onChangeText={(v) =>
                                            setCustomSplits((prev) => ({
                                                ...prev,
                                                [m.id]: v.replace(/[^0-9.]/g, ''),
                                            }))
                                        }
                                        keyboardType="decimal-pad"
                                    />
                                )}
                            </View>
                        ))}

                        {/* Split balance indicator */}
                        {amountPaise != null && amountPaise > 0 && splitTotal !== amountPaise && (
                            <Text style={[styles.splitError, { color: colors.accentDestructive }]}>
                                Split total {formatRupees(splitTotal)} ≠ {formatRupees(amountPaise)}
                            </Text>
                        )}
                    </View>

                    {error ? (
                        <Text style={[styles.errorText, { color: colors.accentDestructive }]}>
                            {error}
                        </Text>
                    ) : null}

                    {/* Delete button — edit mode only */}
                    {isEditMode && (
                        <Pressable
                            style={[styles.deleteButton, { borderColor: colors.accentDestructive }]}
                            onPress={() => setDeleteVisible(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Delete expense"
                        >
                            <Text style={[styles.deleteButtonText, { color: colors.accentDestructive }]}>
                                🗑  Delete Expense
                            </Text>
                        </Pressable>
                    )}
                </ScrollView>

                {/* Submit footer */}
                <View style={[styles.footer, {
                    borderTopColor: colors.separator,
                    backgroundColor: colors.bg,
                }]}>
                    <Pressable
                        style={[
                            styles.submitButton,
                            { backgroundColor: (isValid && !loading) ? colors.accent : colors.inputBorder },
                        ]}
                        onPress={handleSubmit}
                        disabled={!isValid || loading}
                        accessibilityRole="button"
                        accessibilityLabel={isEditMode ? 'Save changes' : 'Add expense'}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitText}>
                                {isEditMode
                                    ? 'Save Changes'
                                    : networkOnline
                                        ? 'Add Expense'
                                        : 'Save Offline'}
                            </Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>

            {/* Delete confirmation */}
            <ConfirmModal
                visible={deleteVisible}
                title={`Delete "${existingExpense?.title ?? ''}"?`}
                message="This expense and its splits will be permanently removed. This cannot be undone."
                confirmLabel="Delete"
                confirmVariant="destructive"
                onConfirm={handleDelete}
                onCancel={() => setDeleteVisible(false)}
            />
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    guardText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

    content: { padding: 20, paddingBottom: 8 },

    offlineBanner: {
        borderRadius: 10, padding: 10,
        marginBottom: 16, alignItems: 'center',
    },
    offlineBannerText: { fontSize: 13, fontWeight: '500' },

    label: {
        fontSize: 13, fontWeight: '500',
        marginBottom: 8, marginTop: 20,
    },
    input: {
        height: 52, borderRadius: 12,
        borderWidth: 1, paddingHorizontal: 16, fontSize: 16,
    },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        borderRadius: 20, paddingVertical: 8,
        paddingHorizontal: 14, borderWidth: 1,
    },
    chipText: { fontSize: 14, fontWeight: '500' },

    memberChip: {
        borderRadius: 20, paddingVertical: 8,
        paddingHorizontal: 14,
    },
    memberChipText: { fontSize: 14, fontWeight: '500' },

    splitHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginTop: 20, marginBottom: 8,
    },
    splitToggle: { flexDirection: 'row', gap: 6 },
    toggleBtn: {
        borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14,
    },
    toggleText: { fontSize: 13, fontWeight: '600' },

    splitCard: {
        borderRadius: 14, padding: 14, gap: 2,
    },
    splitRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', paddingVertical: 8,
    },
    splitName: { fontSize: 15, flex: 1 },
    splitAmount: { fontSize: 15, fontWeight: '500' },
    splitInput: {
        width: 90, height: 38, borderRadius: 8,
        borderWidth: 1, paddingHorizontal: 10,
        fontSize: 14, textAlign: 'right',
    },
    splitError: { fontSize: 12, marginTop: 8, fontWeight: '500' },

    errorText: { fontSize: 13, marginTop: 12 },

    deleteButton: {
        marginTop: 32, height: 52, borderRadius: 14,
        borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    },
    deleteButtonText: { fontSize: 15, fontWeight: '600' },

    footer: {
        padding: 16, paddingBottom: 32,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    submitButton: {
        height: 52, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    progressBarBg: {
        height: 4,
        borderRadius: 2,
        marginBottom: 12,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: 4,
        borderRadius: 2,
    },
});