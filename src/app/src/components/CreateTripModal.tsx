/**
 * src/components/CreateTripModal.tsx
 *
 * Sheet modal for creating a new trip. Collects name, destination, and dates.
 * Calls tripService.createTrip() then calls onCreated() with the result.
 *
 * REFACTOR (Phase B):
 *  - Removed isDark prop entirely — all callers must remove it too.
 *  - Removed hardcoded light/dark color const objects at bottom of file.
 *  - All colors now from useThemeColors() (ThemeContext driven).
 *  - NOTE: This modal will be superseded by app/(trip)/create.tsx in Phase D.5.
 *    Keep working for now — migrate callers to the new route in Phase D.
 *
 * Validation: Zod schema in createTrip() — errors surface here.
 */

import { useState } from 'react';
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
import { ZodError } from 'zod';

import { useThemeColors } from '../hooks/useThemeColors';
import { createTrip } from '../services/tripService';
import { useAuthStore } from '../stores/authStore';
import type { Trip } from '../types/domain';
import { spacing, typography, radii } from '@/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    onClose: () => void;
    onCreated: (trip: Trip) => void;
    /**
     * @deprecated isDark is no longer needed — remove from all call sites.
     * Kept for backwards compatibility only; has no effect.
     */
    isDark?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateTripModal({ onClose, onCreated }: Props) {
    const colors = useThemeColors();
    const deviceUser = useAuthStore((s) => s.deviceUser);

    const [name, setName] = useState('');
    const [destination, setDestination] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCreate() {
        if (!deviceUser?.displayName) return;
        setError(null);
        setLoading(true);
        try {
            const trip = await createTrip(
                { name, destination: destination || undefined },
                deviceUser.displayName,
            );
            onCreated(trip);
        } catch (err) {
            const msg =
                err instanceof ZodError
                    ? err.issues[0]?.message ?? 'Validation error'
                    : err instanceof Error
                        ? err.message
                        : 'Failed to create trip';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={[styles.root, { backgroundColor: colors.surface }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Handle bar */}
            <View style={styles.handleBar}>
                <View style={[styles.handle, { backgroundColor: colors.separator }]} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={[styles.heading, { color: colors.text }]}>New Trip</Text>

                {/* Trip name */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Trip name *</Text>
                <TextInput
                    style={[
                        styles.input,
                        {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.cardBorder,
                        },
                    ]}
                    placeholder="e.g. Goa 2026"
                    placeholderTextColor={colors.placeholder}
                    value={name}
                    onChangeText={(t) => {
                        setName(t);
                        if (error) setError(null);
                    }}
                    autoFocus
                    autoCapitalize="words"
                    returnKeyType="next"
                    maxLength={80}
                />

                {/* Destination */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Destination (optional)</Text>
                <TextInput
                    style={[
                        styles.input,
                        {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.cardBorder,
                        },
                    ]}
                    placeholder="e.g. Goa, India"
                    placeholderTextColor={colors.placeholder}
                    value={destination}
                    onChangeText={setDestination}
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                    maxLength={100}
                />

                {/* Error */}
                {error ? (
                    <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                ) : null}

                {/* Buttons */}
                <View style={styles.buttons}>
                    <Pressable
                        style={[styles.cancelButton, { backgroundColor: colors.subSurface }]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                    >
                        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </Pressable>

                    <Pressable
                        style={[
                            styles.createButton,
                            { backgroundColor: colors.accent },
                            (!name.trim() || loading) && styles.buttonDisabled,
                        ]}
                        onPress={handleCreate}
                        disabled={!name.trim() || loading}
                        accessibilityRole="button"
                        accessibilityLabel="Create trip"
                        accessibilityState={{ disabled: !name.trim() || loading }}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={[styles.createText, { color: colors.textInverse }]}>Create</Text>
                        )}
                    </Pressable>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1 },
    handleBar: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
    handle: { width: 36, height: 4, borderRadius: 2 },
    content: { padding: spacing.lg, paddingTop: spacing.md },
    heading: { ...typography.heading, marginBottom: spacing.lg },
    label: { ...typography.caption, fontWeight: '500', marginBottom: 6, marginTop: spacing.md },
    input: {
        height: 48,
        borderRadius: radii.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        ...typography.body,
    },
    errorText: { ...typography.caption, marginTop: spacing.sm },
    buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
    cancelButton: {
        flex: 1,
        height: 52,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelText: { ...typography.bodyMd },
    createButton: {
        flex: 1,
        height: 52,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.45 },
    // Note: textInverse (#fff) is intentional here — white text on accent button.
    // Applied inline via colors.textInverse in the component.
    createText: { ...typography.bodyMd, fontWeight: '600' },
});