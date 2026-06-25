/**
 * CreateTripModal.tsx
 *
 * Sheet modal for creating a new trip. Collects name, destination, and dates.
 * Calls tripService.createTrip() then calls onCreated() with the result.
 *
 * Validation is done by the Zod schema in createTrip() — errors surface here.
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
import { createTrip } from '../services/tripService';
import { useAuthStore } from '../stores/authStore';
import type { Trip } from '../types/domain';

interface Props {
    isDark: boolean;
    onClose: () => void;
    onCreated: (trip: Trip) => void;
}

export function CreateTripModal({ isDark, onClose, onCreated }: Props) {
    const colors = isDark ? dark : light;
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
            style={[styles.root, { backgroundColor: colors.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Handle bar */}
            <View style={styles.handleBar}>
                <View style={[styles.handle, { backgroundColor: colors.handle }]} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={[styles.heading, { color: colors.text }]}>New Trip</Text>

                <Text style={[styles.label, { color: colors.subText }]}>Trip name *</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="e.g. Goa 2026"
                    placeholderTextColor={colors.placeholder}
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    maxLength={80}
                    returnKeyType="next"
                    editable={!loading}
                />

                <Text style={[styles.label, { color: colors.subText }]}>Destination</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="e.g. Goa, India"
                    placeholderTextColor={colors.placeholder}
                    value={destination}
                    onChangeText={setDestination}
                    maxLength={100}
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                    editable={!loading}
                />

                {error ? (
                    <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                ) : null}

                <View style={styles.buttons}>
                    <Pressable
                        style={[styles.cancelButton, { backgroundColor: colors.cardBg }]}
                        onPress={onClose}
                        disabled={loading}
                    >
                        <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.createButton, { backgroundColor: colors.accent, opacity: loading ? 0.7 : 1 }]}
                        onPress={handleCreate}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.createText}>Create</Text>
                        )}
                    </Pressable>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    handleBar: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
    handle: { width: 36, height: 4, borderRadius: 2 },
    content: { padding: 24, paddingTop: 16 },
    heading: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
    label: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 16 },
    input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
    errorText: { fontSize: 13, marginTop: 8 },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 32 },
    cancelButton: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontSize: 16, fontWeight: '500' },
    createButton: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const light = { bg: '#f2f2f7', text: '#000000', subText: '#6c6c70', inputBg: '#ffffff', border: '#c6c6c8', placeholder: '#8e8e93', accent: '#007aff', error: '#ff3b30', handle: '#c6c6c8', cardBg: '#ffffff' };
const dark = { bg: '#1c1c1e', text: '#ffffff', subText: '#8e8e93', inputBg: '#2c2c2e', border: '#38383a', placeholder: '#636366', accent: '#0a84ff', error: '#ff453a', handle: '#48484a', cardBg: '#2c2c2e' };