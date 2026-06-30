/**
 * app/(trip)/create.tsx — Create / Edit Group (D.5, Phase F image integration)
 *
 * Mode: ?tripId param → Edit, no param → Create.
 * Fields: name (required), description (optional), currency, cover image.
 *
 * Cover image flow:
 *   - Typing the group name (debounced 800ms) auto-fetches a stock photo
 *     suggestion via useGroupImage() — provider-agnostic, see
 *     src/services/imageProviders/ for how to swap Pixabay → Pexels → etc.
 *   - Shuffle (↻) requests a different image for the same query.
 *   - Upload (📷) opens the device photo library via expo-image-picker and
 *     overrides the stock suggestion entirely.
 *   - On submit: if a user-uploaded URI is set, it's uploaded to Supabase
 *     Storage; otherwise the stock image URL (if any) is saved directly.
 *     Either way, cover_image_url is only written once, in handleSubmit —
 *     never on every keystroke or shuffle, to avoid orphaned writes if the
 *     user abandons the form.
 *
 * No broken tokens. All colors from useThemeColors().
 */

import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useGroupImage } from '../../hooks/useGroupImage';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import { createTrip, getTrip } from '../../services/tripService';
import { setTripCoverFromUrl, uploadTripCoverImage } from '../../services/tripImageService';
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

const NAME_DEBOUNCE_MS = 800;

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

    // ── Cover image state ───────────────────────────────────────────────────────
    const groupImage = useGroupImage();
    const [uploadedUri, setUploadedUri] = useState<string | null>(null);
    const [uploadedMime, setUploadedMime] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced auto-fetch as the user types the group name.
    // Skipped once a user upload is in place — typing shouldn't blow away
    // an intentional photo choice.
    useEffect(() => {
        if (uploadedUri) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!name.trim()) {
            groupImage.clear();
            return;
        }

        debounceRef.current = setTimeout(() => {
            groupImage.fetchForName(name);
        }, NAME_DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // groupImage's functions are stable (useCallback with empty/stable deps
        // inside the hook) — only `name` and `uploadedUri` should retrigger this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, uploadedUri]);

    const handleShuffle = useCallback(() => {
        groupImage.shuffle();
    }, [groupImage]);

    const handlePickPhoto = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            showToast({ message: 'Photo library access is needed to upload a cover image.', variant: 'error' });
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
        });

        if (result.canceled || !result.assets[0]) return;

        const asset = result.assets[0];
        setUploadedUri(asset.uri);
        setUploadedMime(asset.mimeType ?? 'image/jpeg');
        groupImage.clear(); // uploaded photo takes priority over the stock suggestion
        await Haptics.selectionAsync();
    }, [groupImage, showToast]);

    const handleRemoveUpload = useCallback(() => {
        setUploadedUri(null);
        setUploadedMime(null);
    }, []);

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
            let resolvedTripId = tripId;

            if (isEditMode && tripId) {
                // Edit path: direct Supabase update, same pattern as EditTripModal.
                // No dedicated updateTrip() service function exists — RLS
                // ("creator can update their trip") is the security gate.
                const { data, error: dbError } = await supabase
                    .from('TravelAppTrips')
                    .update({
                        name: name.trim(),
                        destination: description.trim() || null,
                        cover_image_url: null,
                    })
                    .eq('id', tripId)
                    .select()
                    .single();

                if (dbError || !data) {
                    throw new Error(dbError?.message ?? 'Update failed');
                }

                setTrips(
                    trips.map((t) =>
                        t.id === tripId
                            ? { ...t, name: data.name, destination: data.destination }
                            : t,
                    ),
                );
            } else {
                if (!deviceUser?.displayName) return;
                const trip = await createTrip(
                    { name: name.trim(), destination: description.trim() || undefined },
                    deviceUser.displayName,
                );
                await addTrip(trip);
                resolvedTripId = trip.id;
            }

            // ── Cover image — saved last, after the trip row itself exists ────────
            if (resolvedTripId) {
                try {
                    setUploadingPhoto(true);
                    if (uploadedUri && uploadedMime) {
                        await uploadTripCoverImage(resolvedTripId, uploadedUri, uploadedMime);
                    } else if (groupImage.result) {
                        await setTripCoverFromUrl(resolvedTripId, groupImage.result.fullUrl);
                    }
                } catch (imgErr) {
                    // Cover image failure should never block group creation —
                    // surface a soft warning and let the user retry from edit.
                    showToast({
                        message: 'Group saved, but the cover image could not be set. You can add one from Edit Group.',
                        variant: 'info',
                    });
                    console.warn('[create.tsx] cover image save failed:', imgErr);
                } finally {
                    setUploadingPhoto(false);
                }
            }

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            if (isEditMode) {
                showToast({ message: 'Group updated', variant: 'success' });
                router.back();
            } else {
                router.replace(`/(trip)/${resolvedTripId}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save group.');
        } finally {
            setLoading(false);
        }
    }, [
        name, description, isEditMode, tripId, deviceUser, addTrip, trips, setTrips,
        uploadedUri, uploadedMime, groupImage.result, showToast, router,
    ]);

    const isValid = name.trim().length > 0;
    const isBusy = loading || uploadingPhoto;

    // Resolve what to show in the cover preview area, in priority order:
    // user upload > fetched stock suggestion > initials placeholder.
    const previewUri = uploadedUri ?? groupImage.result?.previewUrl ?? null;

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
                    disabled={!isValid || isBusy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isEditMode ? 'Save changes' : 'Create group'}
                >
                    {isBusy ? (
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

                    {/* ── Cover image section ─────────────────────────────────── */}
                    <View style={[styles.imageSection, { backgroundColor: colors.accentLight }]}>
                        {previewUri ? (
                            <Image
                                source={{ uri: previewUri }}
                                style={styles.imagePreview}
                                contentFit="cover"
                                transition={150}
                            />
                        ) : (
                            <View style={styles.imagePlaceholderInner}>
                                <Text style={[styles.imagePlaceholderInitials, { color: colors.accent }]}>
                                    {name.trim() ? name.trim().slice(0, 2).toUpperCase() : '?'}
                                </Text>
                            </View>
                        )}

                        {groupImage.isLoading && (
                            <View style={styles.imageLoadingOverlay}>
                                <ActivityIndicator color="#FFFFFF" />
                            </View>
                        )}

                        {/* Upload button — top-left */}
                        <Pressable
                            style={[styles.imageIconBtn, styles.imageIconBtnLeft]}
                            onPress={handlePickPhoto}
                            accessibilityRole="button"
                            accessibilityLabel="Upload your own photo"
                        >
                            <Text style={styles.imageIconText}>📷</Text>
                        </Pressable>

                        {/* Shuffle button — top-right, only when showing a stock suggestion */}
                        {!uploadedUri && groupImage.result && (
                            <Pressable
                                style={[styles.imageIconBtn, styles.imageIconBtnRight]}
                                onPress={handleShuffle}
                                disabled={groupImage.isLoading}
                                accessibilityRole="button"
                                accessibilityLabel="Try a different image"
                            >
                                <Text style={styles.imageIconText}>↻</Text>
                            </Pressable>
                        )}

                        {/* Remove upload — top-right, only when a user photo is set */}
                        {uploadedUri && (
                            <Pressable
                                style={[styles.imageIconBtn, styles.imageIconBtnRight]}
                                onPress={handleRemoveUpload}
                                accessibilityRole="button"
                                accessibilityLabel="Remove uploaded photo"
                            >
                                <Text style={styles.imageIconText}>✕</Text>
                            </Pressable>
                        )}
                    </View>

                    {groupImage.result?.attribution && !uploadedUri && (
                        <Text style={[typography.caption, { color: colors.textDisabled, marginTop: spacing.xs, textAlign: 'center' }]}>
                            {groupImage.result.attribution}
                        </Text>
                    )}

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

                    {/* Errors */}
                    {error ? (
                        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md }]}>
                            {error}
                        </Text>
                    ) : null}
                    {groupImage.error ? (
                        <Text style={[typography.caption, { color: colors.textDisabled, marginTop: spacing.sm }]}>
                            Couldn't fetch a cover suggestion — you can still upload your own photo or save without one.
                        </Text>
                    ) : null}

                    {/* Submit button (mobile convenience — header button is primary) */}
                    <Pressable
                        style={[
                            styles.submitBtn,
                            { backgroundColor: isValid && !isBusy ? colors.accent : colors.separator },
                        ]}
                        onPress={handleSubmit}
                        disabled={!isValid || isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={isEditMode ? 'Save changes' : 'Create group'}
                    >
                        {isBusy ? (
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

    imageSection: {
        height: 180,
        borderRadius: radii.lg,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imagePreview: {
        ...StyleSheet.absoluteFillObject,
    },
    imagePlaceholderInner: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    imagePlaceholderInitials: { fontSize: 56, fontWeight: '800' },
    imageLoadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageIconBtn: {
        position: 'absolute',
        top: spacing.sm,
        width: 36,
        height: 36,
        borderRadius: radii.full,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageIconBtnLeft: { left: spacing.sm },
    imageIconBtnRight: { right: spacing.sm },
    imageIconText: { fontSize: 16, color: '#FFFFFF' },

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