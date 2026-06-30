/**
 * src/components/trip/EditTripModal.tsx
 *
 * Bottom-sheet form for editing trip name, destination, and dates.
 * Creator-only. RLS enforces this on the server; the UI checks too.
 * Only sends changed fields to Supabase (no full replace).
 *
 * Fix: replaced hand-rolled Animated + Modal scaffolding with the shared
 *      BottomSheet primitive (removes ~40 lines of duplicate animation code).
 * Fix: removed colors.subText, colors.inputBorder, colors.accentDestructive,
 *      hardcoded '#fff' — all now use canonical tokens.
 *
 * Business logic unchanged: seed-on-open, Zod validation, partial update.
 */

import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
} from 'react-native';
import { ZodError } from 'zod';

import { BottomSheet } from '../ui/BottomSheet';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';
import type { Trip } from '../../types/domain';
import type { Database } from '../../types/supabase';
import { CreateTripSchema } from '../../validation/schemas';
import { spacing, typography, radii } from '@/theme';

interface EditTripModalProps {
    visible: boolean;
    trip: Trip;
    onClose: () => void;
    onUpdated: (updated: Trip) => void;
}

export function EditTripModal({ visible, trip, onClose, onUpdated }: EditTripModalProps) {
    const colors = useThemeColors();
    const { showToast } = useToast();

    const [name, setName] = useState('');
    const [destination, setDestination] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Seed fields on open ──────────────────────────────────────────────────
    useEffect(() => {
        if (visible) {
            setName(trip.name);
            setDestination(trip.destination ?? '');
            setStartDate(trip.startDate ?? '');
            setEndDate(trip.endDate ?? '');
            setError(null);
        }
    }, [visible, trip]);

    // ── Save ──────────────────────────────────────────────────────────────────
    async function handleSave() {
        setError(null);

        type TripUpdate = Database['public']['Tables']['TravelAppTrips']['Update'];
        const patch: TripUpdate = {};
        if (name.trim() !== trip.name) patch.name = name.trim();
        if (destination.trim() !== (trip.destination ?? '')) patch.destination = destination.trim() || null;
        if (startDate.trim() !== (trip.startDate ?? '')) patch.start_date = startDate.trim() || null;
        if (endDate.trim() !== (trip.endDate ?? '')) patch.end_date = endDate.trim() || null;

        if (Object.keys(patch).length === 0) {
            onClose();
            return;
        }

        try {
            CreateTripSchema.partial().parse({
                name: patch.name as string | undefined,
                destination: patch.destination as string | undefined,
            });
        } catch (err) {
            if (err instanceof ZodError) setError(err.issues[0]?.message ?? 'Invalid input');
            return;
        }

        setLoading(true);
        try {
            const { data, error: dbError } = await supabase
                .from('TravelAppTrips')
                .update(patch)
                .eq('id', trip.id)
                .select()
                .single();

            if (dbError || !data) {
                throw new Error(dbError?.message ?? 'Update failed');
            }

            onUpdated({
                ...trip,
                name: data.name,
                destination: data.destination,
                startDate: data.start_date,
                endDate: data.end_date,
            });
            showToast({ message: 'Trip updated', variant: 'success' });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save changes.');
        } finally {
            setLoading(false);
        }
    }

    const isValid = name.trim().length > 0;

    return (
        <BottomSheet visible={visible} onDismiss={onClose}>
            <Text style={[styles.title, { color: colors.text }]}>Edit Trip</Text>

            <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
                <Text style={[styles.label, { color: colors.textSecondary }]}>Trip name</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Goa Trip 2026"
                    placeholderTextColor={colors.placeholder}
                    maxLength={80}
                    autoCapitalize="words"
                    accessibilityLabel="Trip name"
                />

                <Text style={[styles.label, { color: colors.textSecondary }]}>Destination</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                    value={destination}
                    onChangeText={setDestination}
                    placeholder="e.g. Goa, India"
                    placeholderTextColor={colors.placeholder}
                    maxLength={100}
                    accessibilityLabel="Destination"
                />

                <Text style={[styles.label, { color: colors.textSecondary }]}>Start date (YYYY-MM-DD)</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="2026-01-15"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    accessibilityLabel="Start date"
                />

                <Text style={[styles.label, { color: colors.textSecondary }]}>End date (YYYY-MM-DD)</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder }]}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="2026-01-20"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    accessibilityLabel="End date"
                />

                {error ? (
                    <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>
                        {error}
                    </Text>
                ) : null}
            </ScrollView>

            <Pressable
                style={[
                    styles.saveButton,
                    { backgroundColor: isValid ? colors.accent : colors.separator },
                ]}
                onPress={handleSave}
                disabled={!isValid || loading}
                accessibilityRole="button"
                accessibilityLabel="Save changes"
            >
                {loading ? (
                    <ActivityIndicator color={colors.textInverse} />
                ) : (
                    <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '600' }]}>
                        Save Changes
                    </Text>
                )}
            </Pressable>
        </BottomSheet>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    title: {
        ...typography.title,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    scrollArea: {
        maxHeight: 360,
    },
    label: {
        ...typography.caption,
        fontWeight: '500',
        marginBottom: spacing.xs,
        marginTop: spacing.md,
    },
    input: {
        height: 48,
        borderRadius: radii.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        ...typography.body,
    },
    saveButton: {
        height: 52,
        borderRadius: radii.md,
        marginTop: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
});