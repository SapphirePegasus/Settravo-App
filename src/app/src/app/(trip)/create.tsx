/**
 * app/(trip)/create.tsx — Create / Edit Group (D.5)
 *
 * Mode: ?tripId param → Edit, no param → Create.
 * Fields: name (required), description (optional), currency.
 *
 * Image section deferred to Phase F (Pixabay integration).
 * Placeholder shown with group initials.
 *
 * No broken tokens. All colors from useThemeColors().
 */

import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { useThemeColors } from '../../hooks/useThemeColors';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import { createTrip, getTrip } from '../../services/tripService';
import { useAuthStore } from '../../stores/authStore';
import { useTripStore } from '../../stores/tripStore';
import { spacing, typography, radii } from '@/theme';

// ─── Currency options ─────────────────────────────────────────────────────────

const CURRENCIES = [
    { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'GBP', symbol: '£', label: 'British Pound' },
] as const;

type CurrencyCode = typeof CURRENCIES[number]['code'];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreateGroupScreen() {
    const { tripId } = useLocalSearchParams<{ tripId?: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const { showToast } = useToast();

    const isEditMode = Boolean(tripId);
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const addTrip = useTripStore((s) => s.addTrip);
    const trips = useTripStore((s) => s.trips);
    const setTrips = useTripStore((s) => s.setTrips);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [currency, setCurrency] = useState<CurrencyCode>('INR');
    const [loading, setLoading] = useState(false);
    const [seedLoading, setSeedLoading] = useState(isEditMode);
    const [error, setError] = useState<string | null>(null);

    // ── Seed in edit mode ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!isEditMode || !tripId) return;
        (async () => {
            try {
                const trip = await getTrip(tripId);
                if (trip) {
                    setName(trip.name);
                    setDescription(trip.destination ?? '');
                }
            } catch {
                showToast({ message: 'Could not load group details.', variant: 'error' });
            } finally {
                setSeedLoading(false);
            }
        })();
    }, [tripId, isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!name.trim()) return;
        setError(null);
        setLoading(true);

        try {
            if (isEditMode && tripId) {
                // Edit path: direct Supabase update, same pattern as EditTripModal.
                // No dedicated updateTrip() service function exists — RLS
                // ("creator can update their trip") is the security gate.
                const { data, error: dbError } = await supabase
                    .from('TravelAppTrips')
                    .update({
                        name: name.trim(),
                        destination: description.trim() || null,
                    })
                    .eq('id', tripId)
                    .select()
                    .single();

                if (dbError || !data) {
                    throw new Error(dbError?.message ?? 'Update failed');
                }

                // Patch the trip in the store's trips array
                setTrips(
                    trips.map((t) =>
                        t.id === tripId
                            ? { ...t, name: data.name, destination: data.destination }
                            : t,
                    ),
                );

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast({ message: 'Group updated', variant: 'success' });
                router.back();
            } else {
                if (!deviceUser?.displayName) return;
                const trip = await createTrip(
                    { name: name.trim(), destination: description.trim() || undefined },
                    deviceUser.displayName,
                );
                await addTrip(trip);
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.replace(`/(trip)/${trip.id}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save group.');
        } finally {
            setLoading(false);
        }
    }, [name, description, isEditMode, tripId, deviceUser, addTrip, trips, setTrips, showToast, router]);

    const isValid = name.trim().length > 0;

    // ── Render ────────────────────────────────────────────────────────────────

    if (seedLoading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.accent} />
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.separator }]}>
                <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
                    <Text style={[styles.backArrow, { color: colors.accent }]}>←</Text>
                </Pressable>
                <Text style={[typography.title, { color: colors.text }]}>
                    {isEditMode ? 'Edit Group' : 'Create Group'}
                </Text>
                <Pressable
                    onPress={handleSubmit}
                    disabled={!isValid || loading}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isEditMode ? 'Save changes' : 'Create group'}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                        <Text style={[typography.bodyMd, { color: isValid ? colors.accent : colors.textDisabled, fontWeight: '600' }]}>
                            {isEditMode ? 'Save' : 'Create'}
                        </Text>
                    )}
                </Pressable>
            </View>

            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                    {/* Image placeholder (Phase F: Pixabay integration) */}
                    <View style={[styles.imagePlaceholder, { backgroundColor: colors.accentLight }]}>
                        <Text style={[styles.imagePlaceholderInitials, { color: colors.accent }]}>
                            {name.trim() ? name.trim().slice(0, 2).toUpperCase() : '?'}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                            Cover image (Phase F)
                        </Text>
                    </View>

                    {/* Group name */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>GROUP NAME *</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                        placeholder="e.g. Goa 2026"
                        placeholderTextColor={colors.placeholder}
                        value={name}
                        onChangeText={(v) => { setName(v); setError(null); }}
                        autoFocus={!isEditMode}
                        autoCapitalize="words"
                        returnKeyType="next"
                        maxLength={80}
                        accessibilityLabel="Group name"
                    />

                    {/* Description */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>DESCRIPTION (OPTIONAL)</Text>
                    <TextInput
                        style={[styles.input, styles.inputMulti, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                        placeholder="e.g. Goa, India · Beach trip"
                        placeholderTextColor={colors.placeholder}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={2}
                        returnKeyType="done"
                        maxLength={200}
                        accessibilityLabel="Description"
                    />

                    {/* Currency */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CURRENCY</Text>
                    <View style={styles.currencyRow}>
                        {CURRENCIES.map((c) => {
                            const selected = currency === c.code;
                            return (
                                <Pressable
                                    key={c.code}
                                    style={[
                                        styles.currencyChip,
                                        {
                                            backgroundColor: selected ? colors.accent : colors.card,
                                            borderColor: selected ? colors.accent : colors.cardBorder,
                                        },
                                    ]}
                                    onPress={() => setCurrency(c.code)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={`${c.label} currency`}
                                >
                                    <Text style={[typography.bodyMd, { color: selected ? colors.textInverse : colors.text }]}>
                                        {c.symbol} {c.code}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Error */}
                    {error ? (
                        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md }]}>
                            {error}
                        </Text>
                    ) : null}

                    {/* Submit button (mobile convenience — header button is primary) */}
                    <Pressable
                        style={[
                            styles.submitBtn,
                            { backgroundColor: isValid && !loading ? colors.accent : colors.separator },
                        ]}
                        onPress={handleSubmit}
                        disabled={!isValid || loading}
                        accessibilityRole="button"
                        accessibilityLabel={isEditMode ? 'Save changes' : 'Create group'}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.textInverse} />
                        ) : (
                            <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '600' }]}>
                                {isEditMode ? 'Save Changes' : 'Create Group'}
                            </Text>
                        )}
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backArrow: { fontSize: 24 },

    content: { padding: spacing.md, paddingBottom: spacing.xxl },

    imagePlaceholder: {
        height: 180,
        borderRadius: radii.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
    },
    imagePlaceholderInitials: { fontSize: 56, fontWeight: '800' },

    fieldLabel: {
        ...typography.label,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    input: {
        height: 52,
        borderRadius: radii.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        ...typography.body,
    },
    inputMulti: {
        height: 88,
        paddingTop: spacing.sm,
        textAlignVertical: 'top',
    },

    currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    currencyChip: {
        borderRadius: radii.md,
        borderWidth: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },

    submitBtn: {
        marginTop: spacing.xl,
        height: 56,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
});