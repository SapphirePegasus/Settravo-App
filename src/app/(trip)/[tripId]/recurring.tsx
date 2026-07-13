/**
 * app/(trip)/[tripId]/recurring.tsx — Recurring bills (Phase 5)
 *
 * Manage the group's recurring bill templates: list, create, edit,
 * pause/resume, delete. Expenses are materialized lazily server-side
 * (settravo_materialize_recurring) whenever anyone opens the group — this
 * screen only manages the definitions.
 *
 * Product rules implemented here:
 *  - Free tier: FREE_ACTIVE_TEMPLATE_LIMIT (1) active template per user.
 *    Reaching it shows the Settravo Plus upsell instead of the form.
 *  - v1 templates always split equally among the members present when each
 *    bill is created (custom splits are a reserved premium capability).
 *  - Deleting a template never deletes bills it already created.
 *  - Online-only: templates define future money movement and need a single
 *    authoritative definition — no offline queue here, by design.
 */

import * as Haptics from 'expo-haptics';
import * as Sentry from '@sentry/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmModal } from '../../../components/modals/ConfirmModal';
import { Icon } from '../../../components/ui/Icon';
import { useToast } from '../../../components/Toast';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useMembers } from '../../../hooks/useMembers';
import {
    countMyActiveTemplates,
    createTemplate,
    deleteTemplate,
    editTemplate,
    fetchTemplates,
} from '../../../services/templateService';
import { useAuthStore } from '../../../stores/authStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useTemplateStore, EMPTY_TEMPLATES } from '../../../stores/templateStore';
import type { ExpenseCategory, ExpenseTemplate, Recurrence } from '../../../types/domain';
import { FREE_ACTIVE_TEMPLATE_LIMIT } from '../../../types/domain';
import { formatRupees, parseRupeesToPaise } from '../../../utils/money';
import { spacing, typography, radii, shadows } from '@/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const CATEGORIES: { key: ExpenseCategory; label: string }[] = [
    { key: 'stay', label: 'Stay' },
    { key: 'food', label: 'Food' },
    { key: 'transport', label: 'Transport' },
    { key: 'misc', label: 'Others' },
];

function scheduleLabel(t: ExpenseTemplate): string {
    if (t.recurrence === 'monthly') {
        const suffix = t.dueDay === 1 ? 'st' : t.dueDay === 2 ? 'nd' : t.dueDay === 3 ? 'rd' : 'th';
        return `Monthly on the ${t.dueDay}${suffix}`;
    }
    return `Every ${WEEKDAYS[t.dueDay - 1]}`;
}

/** Client-side preview of the first/next bill date, mirroring the RPC rules. */
function nextDueLabel(recurrence: Recurrence, dueDay: number): string {
    const today = new Date();
    let due: Date;

    if (recurrence === 'monthly') {
        due = new Date(today.getFullYear(), today.getMonth(), dueDay);
        if (due < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
            due = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
        }
    } else {
        const isoToday = today.getDay() === 0 ? 7 : today.getDay(); // Sun→7
        const delta = (dueDay - isoToday + 7) % 7;
        due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
    }

    return due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
    editingId: string | null;
    title: string;
    amountText: string;
    category: ExpenseCategory | null;
    paidByMember: string | null;
    recurrence: Recurrence;
    dueDayText: string;   // monthly: '1'–'28'
    weekday: number;      // weekly: 1–7
}

const BLANK_FORM: FormState = {
    editingId: null,
    title: '',
    amountText: '',
    category: null,
    paidByMember: null,
    recurrence: 'monthly',
    dueDayText: '1',
    weekday: 1,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecurringScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const members = useMembers(tripId ?? '');

    const templates = useTemplateStore((s) => s.templates[tripId ?? ''] ?? EMPTY_TEMPLATES);
    const setTemplates = useTemplateStore((s) => s.setTemplates);
    const upsertTemplate = useTemplateStore((s) => s.upsertTemplate);
    const removeTemplate = useTemplateStore((s) => s.removeTemplate);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [myActiveCount, setMyActiveCount] = useState<number | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ExpenseTemplate | null>(null);

    const memberName = useCallback(
        (id: string) => members.find((m) => m.id === id)?.displayName ?? 'Member',
        [members],
    );

    // ── Load ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!tripId || !deviceUser) return;
        let mounted = true;
        Promise.all([fetchTemplates(tripId), countMyActiveTemplates(deviceUser.id)])
            .then(([list, count]) => {
                if (!mounted) return;
                setTemplates(tripId, list);
                setMyActiveCount(count);
            })
            .catch((err) => {
                if (mounted) {
                    showToast({
                        message: err instanceof Error ? err.message : 'Could not load recurring bills.',
                        variant: 'error',
                    });
                }
            })
            .finally(() => mounted && setLoading(false));
        return () => { mounted = false; };
    }, [tripId, deviceUser, setTemplates, showToast]);

    const atFreeLimit =
        myActiveCount !== null && myActiveCount >= FREE_ACTIVE_TEMPLATE_LIMIT;

    // ── Actions ───────────────────────────────────────────────────────────────

    const openCreate = useCallback(() => {
        if (!networkOnline) {
            showToast({ message: 'Recurring bills need a connection.', variant: 'error' });
            return;
        }
        if (atFreeLimit) return; // Upsell card is shown instead of the button.
        setForm({ ...BLANK_FORM, paidByMember: members[0]?.id ?? null });
    }, [networkOnline, atFreeLimit, members, showToast]);

    const openEdit = useCallback((t: ExpenseTemplate) => {
        if (!networkOnline) {
            showToast({ message: 'Recurring bills need a connection.', variant: 'error' });
            return;
        }
        setForm({
            editingId: t.id,
            title: t.title,
            amountText: String(Math.floor(t.amountMoney / 100)),
            category: t.category,
            paidByMember: t.paidByMember,
            recurrence: t.recurrence,
            dueDayText: t.recurrence === 'monthly' ? String(t.dueDay) : '1',
            weekday: t.recurrence === 'weekly' ? t.dueDay : 1,
        });
    }, [networkOnline, showToast]);

    const submitForm = useCallback(async () => {
        if (!form || !tripId || !deviceUser) return;

        const amountMoney = parseRupeesToPaise(form.amountText);
        const dueDay = form.recurrence === 'monthly'
            ? Number.parseInt(form.dueDayText, 10)
            : form.weekday;

        if (!form.title.trim()) {
            showToast({ message: 'Give the bill a name.', variant: 'error' });
            return;
        }
        if (amountMoney === null) {
            showToast({ message: 'Enter a valid amount.', variant: 'error' });
            return;
        }
        if (form.recurrence === 'monthly' && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
            showToast({ message: 'Pick a day between 1 and 28.', variant: 'error' });
            return;
        }
        if (!form.paidByMember) {
            showToast({ message: 'Choose who pays this bill.', variant: 'error' });
            return;
        }

        setSaving(true);
        try {
            if (form.editingId) {
                const updated = await editTemplate({
                    id: form.editingId,
                    title: form.title.trim(),
                    category: form.category,
                    amountMoney,
                    paidByMember: form.paidByMember,
                    recurrence: form.recurrence,
                    dueDay,
                });
                upsertTemplate(updated);
                showToast({ message: 'Recurring bill updated', variant: 'success' });
            } else {
                const created = await createTemplate(
                    {
                        tripId,
                        paidByMember: form.paidByMember,
                        title: form.title.trim(),
                        category: form.category,
                        amountMoney,
                        recurrence: form.recurrence,
                        dueDay,
                    },
                    deviceUser.id,
                );
                upsertTemplate(created);
                setMyActiveCount((c) => (c === null ? c : c + 1));
                showToast({
                    message: `Set — first bill on ${nextDueLabel(form.recurrence, dueDay)}`,
                    variant: 'success',
                });
            }
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setForm(null);
        } catch (err) {
            Sentry.captureException(err, { tags: { feature: 'recurring' }, extra: { tripId } });
            showToast({
                message: err instanceof Error ? err.message : 'Could not save the bill.',
                variant: 'error',
            });
        } finally {
            setSaving(false);
        }
    }, [form, tripId, deviceUser, upsertTemplate, showToast]);

    const toggleActive = useCallback(async (t: ExpenseTemplate, active: boolean) => {
        if (!networkOnline) {
            showToast({ message: 'Recurring bills need a connection.', variant: 'error' });
            return;
        }
        try {
            const updated = await editTemplate({ id: t.id, isActive: active });
            upsertTemplate(updated);
            setMyActiveCount((c) => {
                if (c === null || t.createdByDevice !== deviceUser?.id) return c;
                return active ? c + 1 : Math.max(0, c - 1);
            });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : 'Could not update the bill.',
                variant: 'error',
            });
        }
    }, [networkOnline, upsertTemplate, deviceUser, showToast]);

    const confirmDelete = useCallback(async () => {
        if (!deleteTarget || !tripId) return;
        try {
            await deleteTemplate(deleteTarget.id);
            removeTemplate(tripId, deleteTarget.id);
            setMyActiveCount((c) => {
                if (c === null) return c;
                const wasMineAndActive =
                    deleteTarget.isActive && deleteTarget.createdByDevice === deviceUser?.id;
                return wasMineAndActive ? Math.max(0, c - 1) : c;
            });
            showToast({ message: 'Recurring bill deleted', variant: 'success' });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : 'Could not delete the bill.',
                variant: 'error',
            });
        } finally {
            setDeleteTarget(null);
        }
    }, [deleteTarget, tripId, removeTemplate, deviceUser, showToast]);

    // ── Render ────────────────────────────────────────────────────────────────

    const dueDayPreview = useMemo(() => {
        if (!form) return '';
        const day = form.recurrence === 'monthly'
            ? Number.parseInt(form.dueDayText, 10)
            : form.weekday;
        if (form.recurrence === 'monthly' && (!Number.isInteger(day) || day < 1 || day > 28)) return '';
        return nextDueLabel(form.recurrence, day);
    }, [form]);

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* ── Header ─────────────────────────────────────────────── */}
            <View style={[styles.header, { borderBottomColor: colors.separator }]}>
                <Pressable onPress={() => router.back()} style={styles.headerBtn}
                    accessibilityRole="button" accessibilityLabel="Go back">
                    <Icon name="header.back" size={24} color={colors.accent} />
                </Pressable>
                <Text style={[typography.bodyMd, { color: colors.text }]}>Recurring Bills</Text>
                <View style={styles.headerBtn} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                    Bills that repeat — rent, Wi-Fi, the maid, a subscription. Each one is
                    added automatically when due and split equally among everyone in the
                    group at that time.
                </Text>

                {loading && (
                    <View style={styles.loadingRow}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                )}

                {/* ── Template list ──────────────────────────────────── */}
                {!loading && templates.length === 0 && (
                    <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                        <Icon name="nav.calendar" size={40} color={colors.icon} />
                        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                            No recurring bills yet.
                        </Text>
                    </View>
                )}

                {templates.map((t) => (
                    <View key={t.id}
                        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, shadows.low]}>
                        <View style={styles.cardTop}>
                            <View style={styles.cardInfo}>
                                <Text style={[typography.bodyMd, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                                    {t.title}
                                </Text>
                                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                                    {scheduleLabel(t)} · paid by {memberName(t.paidByMember)}
                                </Text>
                            </View>
                            <Text style={[typography.monoLg, { color: colors.text }]}>
                                {formatRupees(t.amountMoney)}
                            </Text>
                        </View>

                        <View style={[styles.cardBottom, { borderTopColor: colors.separator }]}>
                            <View style={styles.activeRow}>
                                <Switch
                                    value={t.isActive}
                                    onValueChange={(v) => toggleActive(t, v)}
                                    trackColor={{ true: colors.accent, false: colors.separator }}
                                    accessibilityLabel={t.isActive ? 'Pause this bill' : 'Resume this bill'}
                                />
                                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                    {t.isActive ? 'Active' : 'Paused'}
                                </Text>
                            </View>
                            <View style={styles.cardActions}>
                                <Pressable onPress={() => openEdit(t)} hitSlop={8} style={styles.iconBtn}
                                    accessibilityRole="button" accessibilityLabel={`Edit ${t.title}`}>
                                    <Icon name="action.edit" size={18} color={colors.icon} />
                                </Pressable>
                                <Pressable onPress={() => setDeleteTarget(t)} hitSlop={8} style={styles.iconBtn}
                                    accessibilityRole="button" accessibilityLabel={`Delete ${t.title}`}>
                                    <Icon name="action.delete" size={18} color={colors.owe} />
                                </Pressable>
                            </View>
                        </View>
                    </View>
                ))}

                {/* ── Create button / free-tier upsell ───────────────── */}
                {!loading && (
                    atFreeLimit && !templates.some((t) => t.createdByDevice === deviceUser?.id && !t.isActive) ? (
                        <View style={[styles.upsellCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
                            <Text style={[typography.bodyMd, { color: colors.text, fontWeight: '600' }]}>
                                Free plan includes {FREE_ACTIVE_TEMPLATE_LIMIT} recurring bill
                            </Text>
                            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                                Settravo Plus unlocks unlimited recurring bills — coming soon.
                                You can also pause your current bill to set up a different one.
                            </Text>
                        </View>
                    ) : atFreeLimit ? (
                        <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                            Pause or delete your active bill to add a different one (free plan:
                            {' '}{FREE_ACTIVE_TEMPLATE_LIMIT} active).
                        </Text>
                    ) : (
                        <Pressable
                            style={[styles.addBtn, { backgroundColor: colors.accent }]}
                            onPress={openCreate}
                            accessibilityRole="button"
                            accessibilityLabel="Add recurring bill"
                        >
                            <Icon name="action.add" size={18} color={colors.textInverse} />
                            <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '700' }]}>
                                New Recurring Bill
                            </Text>
                        </Pressable>
                    )
                )}
            </ScrollView>

            {/* ── Create / edit form ─────────────────────────────────── */}
            <Modal visible={form !== null} animationType="slide" presentationStyle="pageSheet"
                onRequestClose={() => setForm(null)}>
                {form && (
                    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right', 'bottom']}>
                        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
                            <Pressable onPress={() => setForm(null)} style={styles.headerBtn}
                                accessibilityRole="button" accessibilityLabel="Close">
                                <Icon name="action.close" size={24} color={colors.icon} />
                            </Pressable>
                            <Text style={[typography.bodyMd, { color: colors.text }]}>
                                {form.editingId ? 'Edit Bill' : 'New Recurring Bill'}
                            </Text>
                            <View style={styles.headerBtn} />
                        </View>

                        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                            {/* Name */}
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NAME</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                                value={form.title}
                                onChangeText={(v) => setForm({ ...form, title: v })}
                                placeholder="e.g. Rent, Wi-Fi, Maid"
                                placeholderTextColor={colors.textDisabled}
                                maxLength={120}
                                accessibilityLabel="Bill name"
                            />

                            {/* Amount */}
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>AMOUNT (₹)</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                                value={form.amountText}
                                onChangeText={(v) => setForm({ ...form, amountText: v })}
                                placeholder="15000"
                                placeholderTextColor={colors.textDisabled}
                                keyboardType="decimal-pad"
                                accessibilityLabel="Amount in rupees"
                            />

                            {/* Recurrence */}
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>REPEATS</Text>
                            <View style={styles.segment}>
                                {(['monthly', 'weekly'] as const).map((r) => (
                                    <Pressable key={r}
                                        style={[styles.segmentBtn,
                                            { backgroundColor: form.recurrence === r ? colors.accent : colors.card, borderColor: colors.cardBorder }]}
                                        onPress={() => setForm({ ...form, recurrence: r })}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: form.recurrence === r }}>
                                        <Text style={[typography.bodyMd,
                                            { color: form.recurrence === r ? colors.textInverse : colors.text, fontWeight: '600' }]}>
                                            {r === 'monthly' ? 'Monthly' : 'Weekly'}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            {/* Due day */}
                            {form.recurrence === 'monthly' ? (
                                <>
                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>DAY OF MONTH (1–28)</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                                        value={form.dueDayText}
                                        onChangeText={(v) => setForm({ ...form, dueDayText: v.replace(/[^0-9]/g, '') })}
                                        keyboardType="number-pad"
                                        maxLength={2}
                                        accessibilityLabel="Day of month, 1 to 28"
                                    />
                                </>
                            ) : (
                                <>
                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>DAY OF WEEK</Text>
                                    <View style={styles.chipsRow}>
                                        {WEEKDAYS.map((d, i) => (
                                            <Pressable key={d}
                                                style={[styles.chip,
                                                    { backgroundColor: form.weekday === i + 1 ? colors.accent : colors.card, borderColor: colors.cardBorder }]}
                                                onPress={() => setForm({ ...form, weekday: i + 1 })}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected: form.weekday === i + 1 }}>
                                                <Text style={[typography.caption,
                                                    { color: form.weekday === i + 1 ? colors.textInverse : colors.text, fontWeight: '600' }]}>
                                                    {d}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </>
                            )}

                            {dueDayPreview !== '' && (
                                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                                    Next bill: {dueDayPreview}
                                </Text>
                            )}

                            {/* Paid by */}
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>PAID BY</Text>
                            <View style={styles.chipsRow}>
                                {members.map((m) => (
                                    <Pressable key={m.id}
                                        style={[styles.chip,
                                            { backgroundColor: form.paidByMember === m.id ? colors.accent : colors.card, borderColor: colors.cardBorder }]}
                                        onPress={() => setForm({ ...form, paidByMember: m.id })}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: form.paidByMember === m.id }}>
                                        <Text style={[typography.caption,
                                            { color: form.paidByMember === m.id ? colors.textInverse : colors.text, fontWeight: '600' }]}
                                            numberOfLines={1}>
                                            {m.displayName}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            {/* Category (optional) */}
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CATEGORY (OPTIONAL)</Text>
                            <View style={styles.chipsRow}>
                                {CATEGORIES.map((c) => (
                                    <Pressable key={c.key}
                                        style={[styles.chip,
                                            { backgroundColor: form.category === c.key ? colors.accent : colors.card, borderColor: colors.cardBorder }]}
                                        onPress={() => setForm({ ...form, category: form.category === c.key ? null : c.key })}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: form.category === c.key }}>
                                        <Text style={[typography.caption,
                                            { color: form.category === c.key ? colors.textInverse : colors.text, fontWeight: '600' }]}>
                                            {c.label}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                                Split equally among everyone in the group each time the bill is created.
                            </Text>

                            <Pressable
                                style={[styles.addBtn, { backgroundColor: colors.accent, marginTop: spacing.lg, opacity: saving ? 0.6 : 1 }]}
                                onPress={submitForm}
                                disabled={saving}
                                accessibilityRole="button"
                                accessibilityLabel={form.editingId ? 'Save bill' : 'Create bill'}
                            >
                                {saving
                                    ? <ActivityIndicator color={colors.textInverse} />
                                    : (
                                        <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '700' }]}>
                                            {form.editingId ? 'Save Changes' : 'Create Recurring Bill'}
                                        </Text>
                                    )}
                            </Pressable>
                        </ScrollView>
                    </SafeAreaView>
                )}
            </Modal>

            {deleteTarget && (
                <ConfirmModal
                    visible
                    title="Delete recurring bill?"
                    message={`"${deleteTarget.title}" will stop repeating. Bills it already created are kept.`}
                    confirmLabel="Delete"
                    confirmVariant="destructive"
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
    loadingRow: { alignItems: 'center', paddingVertical: spacing.lg },

    emptyCard: { borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.md },

    card: { borderRadius: radii.lg, borderWidth: 1, marginBottom: spacing.md },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    cardInfo: { flex: 1, minWidth: 0 },
    cardBottom: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    activeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cardActions: { flexDirection: 'row', gap: spacing.md },
    iconBtn: { padding: spacing.xs },

    upsellCard: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginTop: spacing.sm },

    addBtn: {
        height: 48, borderRadius: radii.md, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
        marginTop: spacing.sm,
    },

    fieldLabel: {
        fontSize: 11, fontWeight: '600', letterSpacing: 0.6,
        marginBottom: spacing.xs, marginTop: spacing.md,
    },
    input: {
        height: 48, borderRadius: radii.md, borderWidth: 1,
        paddingHorizontal: spacing.md, fontSize: 16,
    },
    segment: { flexDirection: 'row', gap: spacing.sm },
    segmentBtn: {
        flex: 1, height: 44, borderRadius: radii.md, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        borderRadius: radii.full, borderWidth: 1,
    },
});