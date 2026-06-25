/**
 * app/(trip)/[tripId]/add-expense.tsx — Add Expense screen (Phase 4)
 *
 * Phase 4 change: members loaded via useMembers() (memberStore cache)
 * instead of a local getTripMembers() call. This means members are
 * always in sync with what the trip detail screen added.
 */

import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView, Platform,
    Pressable, ScrollView,
    StyleSheet,
    Text, TextInput,
    useColorScheme,
    View,
} from 'react-native';
import { useMembers } from '../../../hooks/useMembers';
import { addExpenseWithSplits } from '../../../services/expenseService';
import { useAuthStore } from '../../../stores/authStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useExpenseStore } from '../../../stores/expenseStore';
import { useTripStore } from '../../../stores/tripStore';
import type { ExpenseCategory } from '../../../types/domain';
import { formatRupees, parseRupeesToPaise, splitEvenly } from '../../../utils/money';
import { validateSplitTotal } from '../../../validation/schemas';

const CATEGORIES: { label: string; value: ExpenseCategory }[] = [
    { label: '🍽 Food', value: 'food' },
    { label: '🚗 Transport', value: 'transport' },
    { label: '🏨 Stay', value: 'stay' },
    { label: '📦 Misc', value: 'misc' },
];

export default function AddExpenseScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = isDark ? dark : light;

    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const addExpenseOptimistic = useExpenseStore((s) => s.addExpenseOptimistic);
    const confirmExpense = useExpenseStore((s) => s.confirmExpense);
    const enqueueOfflineItem = useTripStore((s) => s.enqueueOfflineItem);

    // Members from shared store — no extra fetch if trip detail already loaded them
    const members = useMembers(tripId ?? '');

    const [title, setTitle] = useState('');
    const [amountStr, setAmountStr] = useState('');
    const [category, setCategory] = useState<ExpenseCategory | null>(null);
    const [paidByMemberId, setPaidByMemberId] = useState<string | null>(null);
    const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
    const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-select current device's member as payer
    useEffect(() => {
        if (paidByMemberId || !deviceUser?.id) return;
        const myMember = members.find((m) => m.deviceId === deviceUser.id);
        if (myMember) setPaidByMemberId(myMember.id);
    }, [members, deviceUser?.id, paidByMemberId]);

    const amountPaise = useMemo(() => parseRupeesToPaise(amountStr), [amountStr]);

    const equalSplits = useMemo(() => {
        if (!amountPaise || members.length === 0) return {} as Record<string, number>;
        const shares = splitEvenly(amountPaise, members.length);
        return Object.fromEntries(members.map((m, i) => [m.id, shares[i]]));
    }, [amountPaise, members]);

    const finalSplits = useMemo(() => {
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

    const handleSubmit = useCallback(async () => {
        if (!isValid || !tripId || !paidByMemberId || !amountPaise) return;
        setError(null);

        try {
            validateSplitTotal(
                Object.values(finalSplits).map((shareMoney) => ({ shareMoney })),
                amountPaise,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Split total mismatch');
            return;
        }

        const splits = Object.entries(finalSplits).map(([memberId, shareMoney]) => ({
            memberId,
            shareMoney,
        }));

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
                payload: {
                    tripId,
                    paidByMember: paidByMemberId,
                    title: title.trim(),
                    category,
                    amountMoney: amountPaise,
                },
            });
            router.back();
            return;
        }

        setLoading(true);
        try {
            const { expense } = await addExpenseWithSplits(
                { tripId, paidByMember: paidByMemberId, title: title.trim(), category, amountMoney: amountPaise },
                { splits },
            );
            confirmExpense(tripId, localId, expense);
            router.back();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save expense.');
            setLoading(false);
        }
    }, [
        isValid, tripId, paidByMemberId, amountPaise, title, category,
        finalSplits, networkOnline, addExpenseOptimistic, confirmExpense,
        enqueueOfflineItem, router,
    ]);

    return (
        <KeyboardAvoidingView
            style={[styles.root, { backgroundColor: colors.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {!networkOnline && (
                    <View style={[styles.offlineBanner, { backgroundColor: colors.warningBg }]}>
                        <Text style={[styles.offlineBannerText, { color: colors.warningText }]}>
                            Offline — expense will sync when reconnected.
                        </Text>
                    </View>
                )}

                <Text style={[styles.label, { color: colors.subText }]}>What was it for? *</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="e.g. Dinner at beach shack"
                    placeholderTextColor={colors.placeholder}
                    value={title}
                    onChangeText={setTitle}
                    autoFocus
                    maxLength={120}
                />

                <Text style={[styles.label, { color: colors.subText }]}>Amount (₹) *</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.placeholder}
                    value={amountStr}
                    onChangeText={(v) => setAmountStr(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                />

                <Text style={[styles.label, { color: colors.subText }]}>Category</Text>
                <View style={styles.chipRow}>
                    {CATEGORIES.map((c) => (
                        <Pressable
                            key={c.value}
                            style={[styles.chip, { backgroundColor: category === c.value ? colors.accent : colors.card }]}
                            onPress={() => setCategory(category === c.value ? null : c.value)}
                        >
                            <Text style={[styles.chipText, { color: category === c.value ? '#fff' : colors.text }]}>
                                {c.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={[styles.label, { color: colors.subText }]}>Paid by *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {members.map((m) => (
                        <Pressable
                            key={m.id}
                            style={[styles.memberChip, { backgroundColor: paidByMemberId === m.id ? colors.accent : colors.card, marginRight: 8 }]}
                            onPress={() => setPaidByMemberId(m.id)}
                        >
                            <Text style={[styles.memberChipText, { color: paidByMemberId === m.id ? '#fff' : colors.text }]}>
                                {m.displayName}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                <View style={styles.splitHeader}>
                    <Text style={[styles.label, { color: colors.subText, marginBottom: 0, marginTop: 0 }]}>Split</Text>
                    <View style={styles.splitToggle}>
                        {(['equal', 'custom'] as const).map((mode) => (
                            <Pressable
                                key={mode}
                                style={[styles.toggleBtn, { backgroundColor: splitMode === mode ? colors.accent : colors.card }]}
                                onPress={() => setSplitMode(mode)}
                            >
                                <Text style={[styles.toggleText, { color: splitMode === mode ? '#fff' : colors.text }]}>
                                    {mode === 'equal' ? 'Equal' : 'Custom'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

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
                                    style={[styles.splitInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                                    placeholder="0"
                                    placeholderTextColor={colors.placeholder}
                                    value={customSplits[m.id] ?? ''}
                                    onChangeText={(v) =>
                                        setCustomSplits((prev) => ({ ...prev, [m.id]: v.replace(/[^0-9.]/g, '') }))
                                    }
                                    keyboardType="decimal-pad"
                                />
                            )}
                        </View>
                    ))}
                    {amountPaise && splitTotal !== amountPaise ? (
                        <Text style={[styles.splitError, { color: colors.error }]}>
                            Split total {formatRupees(splitTotal)} ≠ {formatRupees(amountPaise)}
                        </Text>
                    ) : null}
                </View>

                {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

                <Pressable
                    style={[styles.submitButton, { backgroundColor: colors.accent, opacity: (!isValid || loading) ? 0.5 : 1 }]}
                    onPress={handleSubmit}
                    disabled={!isValid || loading}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : (
                        <Text style={styles.submitText}>
                            {networkOnline ? 'Add Expense' : 'Save (offline)'}
                        </Text>
                    )}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { padding: 20, paddingBottom: 48, gap: 4 },
    offlineBanner: { borderRadius: 10, padding: 12, marginBottom: 8 },
    offlineBannerText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
    label: { fontSize: 13, fontWeight: '500', marginTop: 16, marginBottom: 6 },
    input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    chipText: { fontSize: 14 },
    memberChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    memberChipText: { fontSize: 15, fontWeight: '500' },
    splitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    splitToggle: { flexDirection: 'row', gap: 6 },
    toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
    toggleText: { fontSize: 13, fontWeight: '500' },
    splitCard: { borderRadius: 14, padding: 14, marginTop: 8, gap: 10 },
    splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    splitName: { fontSize: 15, flex: 1 },
    splitAmount: { fontSize: 15 },
    splitInput: { width: 90, height: 36, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, fontSize: 15, textAlign: 'right' },
    splitError: { fontSize: 12, marginTop: 4 },
    errorText: { fontSize: 13, marginTop: 8 },
    submitButton: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
    submitText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

const light = { bg: '#f2f2f7', text: '#000000', subText: '#6c6c70', card: '#ffffff', inputBg: '#ffffff', border: '#c6c6c8', placeholder: '#8e8e93', accent: '#007aff', error: '#ff3b30', warningBg: '#fff3cd', warningText: '#856404' };
const dark = { bg: '#000000', text: '#ffffff', subText: '#8e8e93', card: '#1c1c1e', inputBg: '#1c1c1e', border: '#38383a', placeholder: '#636366', accent: '#0a84ff', error: '#ff453a', warningBg: '#3a2a00', warningText: '#ffd966' };