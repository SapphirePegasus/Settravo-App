/**
 * app/(trip)/create.tsx — Create / Edit Group
 *
 * 📷 camera emoji → <Icon name="action.camera" />
 * ✕ close text → <Icon name="action.close" />
 * ← back arrow text → <Icon name="header.back" />
 * ↻ shuffle text → <Icon name="action.refresh" />
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

import { Icon } from '../../components/ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useGroupImage } from '../../hooks/useGroupImage';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import { createTrip, getTrip } from '../../services/tripService';
import { downloadAndUploadStockImage, uploadTripCoverImage } from '../../services/tripImageService';
import { useAuthStore } from '../../stores/authStore';
import { useTripStore } from '../../stores/tripStore';
import { spacing, typography, radii } from '@/theme';

const CURRENCIES = [
    { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'GBP', symbol: '£', label: 'British Pound' },
] as const;

type CurrencyCode = typeof CURRENCIES[number]['code'];
const NAME_DEBOUNCE_MS = 800;

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

    const groupImage = useGroupImage();
    const [uploadedUri, setUploadedUri] = useState<string | null>(null);
    const [uploadedMime, setUploadedMime] = useState<string | null>(null);
    const [imageLoadFailed, setImageLoadFailed] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset load-failed flag whenever the suggestion changes so every new
    // result gets a fresh attempt before the placeholder fallback is shown.
    useEffect(() => { setImageLoadFailed(false); }, [groupImage.result?.previewUrl]);

    useEffect(() => {
        if (uploadedUri) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!name.trim()) { groupImage.clear(); return; }
        debounceRef.current = setTimeout(() => { groupImage.fetchForName(name); }, NAME_DEBOUNCE_MS);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, uploadedUri]);

    const handleShuffle = useCallback(() => { groupImage.shuffle(); }, [groupImage]);

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
        groupImage.clear();
        await Haptics.selectionAsync();
    }, [groupImage, showToast]);

    const handleRemoveUpload = useCallback(() => {
        setUploadedUri(null);
        setUploadedMime(null);
    }, []);

    useEffect(() => {
        if (!isEditMode || !tripId) return;
        (async () => {
            try {
                const trip = await getTrip(tripId);
                if (trip) { setName(trip.name); setDescription(trip.destination ?? ''); }
            } catch {
                showToast({ message: 'Could not load group details.', variant: 'error' });
            } finally {
                setSeedLoading(false);
            }
        })();
    }, [tripId, isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = useCallback(async () => {
        if (!name.trim()) return;
        setError(null);
        setLoading(true);
        try {
            let resolvedTripId = tripId;

            if (isEditMode && tripId) {
                const { data, error: dbError } = await supabase
                    .from('TravelAppTrips')
                    .update({ name: name.trim(), destination: description.trim() || null, cover_image_url: null })
                    .eq('id', tripId).select().single();
                if (dbError || !data) throw new Error(dbError?.message ?? 'Update failed');
                setTrips(trips.map((t) => t.id === tripId ? { ...t, name: data.name, destination: data.destination } : t));
            } else {
                if (!deviceUser?.displayName) return;
                const trip = await createTrip(
                    { name: name.trim(), destination: description.trim() || undefined },
                    deviceUser.displayName,
                );
                await addTrip(trip);
                resolvedTripId = trip.id;
            }

            if (resolvedTripId) {
                try {
                    setUploadingPhoto(true);
                    if (uploadedUri && uploadedMime) {
                        await uploadTripCoverImage(resolvedTripId, uploadedUri, uploadedMime);
                    } else if (groupImage.result) {
                        // Download the stock image via controlled fetch and upload to
                        // Supabase Storage. This ensures:
                        //   (a) The image is stored under our own bucket (not a raw
                        //       third-party CDN URL that may expire or change).
                        //   (b) Our fetch() sends proper headers that bypass CDN
                        //       hotlink guards that the Image component cannot satisfy.
                        await downloadAndUploadStockImage(resolvedTripId, groupImage.result.fullUrl);
                    }
                } catch (imgErr) {
                    showToast({
                        message: 'Group saved, but the cover image could not be set.',
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
    const previewUri = uploadedUri ?? groupImage.result?.previewUrl ?? null;

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
                <Pressable
                    onPress={() => router.back()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    style={styles.headerBtn}
                >
                    <Icon name="header.back" size={24} color={colors.accent} />
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
                    style={styles.headerBtn}
                >
                    {isBusy ? (
                        <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                        <Text style={[typography.bodyMd, { color: isValid ? colors.accent : colors.textDisabled, fontWeight: '600' }]}>
                            {isEditMode ? '' : ''}
                        </Text>
                    )}
                </Pressable>
            </View>

            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                    {/* Cover image */}
                    <View style={[styles.imageSection, { backgroundColor: colors.accentLight }]}>
                        {previewUri && !imageLoadFailed ? (
                            <Image
                                source={{ uri: previewUri }}
                                style={styles.imagePreview}
                                contentFit="cover"
                                transition={150}
                                onError={() => setImageLoadFailed(true)}
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
                            <Icon name="action.camera" size={18} color="#FFFFFF" />
                        </Pressable>

                        {/* Shuffle — top-right, stock suggestions only */}
                        {!uploadedUri && groupImage.result && (
                            <Pressable
                                style={[styles.imageIconBtn, styles.imageIconBtnRight]}
                                onPress={handleShuffle}
                                disabled={groupImage.isLoading}
                                accessibilityRole="button"
                                accessibilityLabel="Try a different image"
                            >
                                <Icon name="action.refresh" size={18} color="#FFFFFF" />
                            </Pressable>
                        )}

                        {/* Remove upload — top-right, user photo only */}
                        {uploadedUri && (
                            <Pressable
                                style={[styles.imageIconBtn, styles.imageIconBtnRight]}
                                onPress={handleRemoveUpload}
                                accessibilityRole="button"
                                accessibilityLabel="Remove uploaded photo"
                            >
                                <Icon name="action.close" size={18} color="#FFFFFF" />
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

                    {/* Currency}
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
                    </View>*/}

                    {error ? (
                        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md }]}>{error}</Text>
                    ) : null}
                    {groupImage.error ? (
                        <Text style={[typography.caption, { color: colors.textDisabled, marginTop: spacing.sm }]}>
                            Couldn't fetch a cover suggestion — you can still upload your own photo.
                        </Text>
                    ) : null}

                    {/* Submit */}
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
    headerBtn: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
    content: { padding: spacing.md, paddingBottom: spacing.xxl },
    imageSection: {
        height: 180,
        borderRadius: radii.lg,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imagePreview: { ...StyleSheet.absoluteFillObject },
    imagePlaceholderInner: { alignItems: 'center', justifyContent: 'center' },
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
    fieldLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
    input: {
        height: 52,
        borderRadius: radii.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        ...typography.body,
    },
    inputMulti: { height: 88, paddingTop: spacing.sm, textAlignVertical: 'top' },
    currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    currencyChip: {
        borderRadius: radii.md,
        borderWidth: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    submitBtn: {
        marginTop: spacing.xxl,
        height: 56,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
});