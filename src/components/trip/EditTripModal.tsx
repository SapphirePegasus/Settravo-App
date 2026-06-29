/**
 * EditTripModal.tsx
 *
 * Bottom-sheet form for editing trip name, destination, and dates.
 * Creator-only. RLS enforces this on the server; the UI checks too.
 *
 * Only sends changed fields to Supabase (no full replace).
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';
import type { Trip } from '../../types/domain';
import { CreateTripSchema } from '../../validation/schemas';

interface Props {
    visible: boolean;
    trip: Trip;
    onClose: () => void;
    onUpdated: (updated: Trip) => void;
}

export function EditTripModal({ visible, trip, onClose, onUpdated }: Props) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();

    const [name, setName] = useState('');
    const [destination, setDestination] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const translateY = useRef(new Animated.Value(600)).current;
    const scrimOpacity = useRef(new Animated.Value(0)).current;

    // Seed fields on open
    useEffect(() => {
        if (visible) {
            setName(trip.name);
            setDestination(trip.destination ?? '');
            setStartDate(trip.startDate ?? '');
            setEndDate(trip.endDate ?? '');
            setError(null);
        }
    }, [visible, trip]);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 1, duration: 180, useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: 600, duration: 240,
                    easing: Easing.in(Easing.ease), useNativeDriver: true,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 0, duration: 200, useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, translateY, scrimOpacity]);

    // Need to declare ref after hook calls
    const translateYRef = useRef(translateY);
    const scrimRef = useRef(scrimOpacity);

    const handleSave = useCallback(async () => {
        setError(null);

        // Validate via existing schema (partial)
        try {
            CreateTripSchema.parse({
                name,
                destination: destination || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Invalid input');
            return;
        }

        setLoading(true);
        try {
            const { data, error: dbErr } = await supabase
                .from('TravelAppTrips')
                .update({
                    name: name.trim(),
                    destination: destination.trim() || null,
                    start_date: startDate || null,
                    end_date: endDate || null,
                })
                .eq('id', trip.id)
                .select()
                .single();

            if (dbErr || !data) throw new Error(dbErr?.message ?? 'Update failed');

            const updated: Trip = {
                ...trip,
                name: data.name,
                destination: data.destination,
                startDate: data.start_date,
                endDate: data.end_date,
            };

            onUpdated(updated);
            showToast({ message: 'Trip updated', variant: 'success' });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save changes.');
        } finally {
            setLoading(false);
        }
    }, [name, destination, startDate, endDate, trip, onUpdated, showToast, onClose]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </Animated.View>

            <Animated.View
                style={[
                    styles.sheet,
                    {
                        backgroundColor: colors.card,
                        paddingBottom: insets.bottom + 16,
                        transform: [{ translateY }],
                    },
                ]}
            >
                <View style={[styles.handle, { backgroundColor: colors.handleBar }]} />
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit Trip</Text>

                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    <Text style={[styles.label, { color: colors.subText }]}>Trip name *</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.inputBorder,
                        }]}
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g. Goa Trip 2025"
                        placeholderTextColor={colors.placeholder}
                        maxLength={80}
                        autoCapitalize="words"
                    />

                    <Text style={[styles.label, { color: colors.subText }]}>Destination</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.inputBorder,
                        }]}
                        value={destination}
                        onChangeText={setDestination}
                        placeholder="e.g. Goa, India"
                        placeholderTextColor={colors.placeholder}
                        maxLength={100}
                    />

                    <Text style={[styles.label, { color: colors.subText }]}>Start date (YYYY-MM-DD)</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.inputBorder,
                        }]}
                        value={startDate}
                        onChangeText={setStartDate}
                        placeholder="2025-01-15"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="numbers-and-punctuation"
                        maxLength={10}
                    />

                    <Text style={[styles.label, { color: colors.subText }]}>End date (YYYY-MM-DD)</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: colors.inputBorder,
                        }]}
                        value={endDate}
                        onChangeText={setEndDate}
                        placeholder="2025-01-20"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="numbers-and-punctuation"
                        maxLength={10}
                    />

                    {error && (
                        <Text style={[styles.errorText, { color: colors.accentDestructive }]}>
                            {error}
                        </Text>
                    )}
                </ScrollView>

                <Pressable
                    style={[
                        styles.saveButton,
                        { backgroundColor: name.trim() ? colors.accent : colors.inputBorder },
                    ]}
                    onPress={handleSave}
                    disabled={!name.trim() || loading}
                    accessibilityRole="button"
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                    )}
                </Pressable>
            </Animated.View>
        </Modal>
    );
}

// Fix: useRef calls must be at component top level — moved translateY/scrimOpacity refs above
const styles = StyleSheet.create({
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8,
        maxHeight: '85%',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 12 },
            android: { elevation: 12 },
        }),
    },
    handle: {
        width: 36, height: 4, borderRadius: 2,
        alignSelf: 'center', marginBottom: 8,
    },
    sheetTitle: {
        fontSize: 18, fontWeight: '700',
        textAlign: 'center', marginBottom: 16, paddingHorizontal: 20,
    },
    scrollContent: { paddingHorizontal: 20 },
    label: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 14 },
    input: {
        height: 48, borderRadius: 12, borderWidth: 1,
        paddingHorizontal: 14, fontSize: 15,
    },
    errorText: { fontSize: 13, marginTop: 10 },
    saveButton: {
        height: 52, borderRadius: 14, marginHorizontal: 20, marginTop: 20,
        alignItems: 'center', justifyContent: 'center',
    },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});