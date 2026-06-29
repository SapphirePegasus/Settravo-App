/**
 * app/(trip)/join.tsx — Join Trip screen
 *
 * Two join methods:
 *  1. QR scan via CameraView.launchScanner() (system scanner, no permission prompt)
 *  2. Manual 4-char code entry with auto-uppercase
 *
 * QR payload format: "settravo://join?code=XXXX"
 *
 * REFACTOR: removed useColorScheme() + broken token refs (subText→textSecondary,
 * border→cardBorder, error→danger, warningText→warning).
 */

import { CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemeColors } from '../../hooks/useThemeColors';
import { joinTrip } from '../../services/tripService';
import { useAuthStore } from '../../stores/authStore';
import { useTripStore } from '../../stores/tripStore';
import { spacing, typography, radii } from '@/theme';

const QR_PREFIX = 'settravo://join?code=';

export default function JoinScreen() {
    const router = useRouter();
    const colors = useThemeColors();

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const addTrip = useTripStore((s) => s.addTrip);
    const setActiveTripId = useTripStore((s) => s.setActiveTripId);

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── QR scan ───────────────────────────────────────────────────────────────

    const handleCodeFromScan = useCallback((raw: string) => {
        let extracted = raw.trim().toUpperCase();
        if (extracted.startsWith(QR_PREFIX.toUpperCase())) {
            extracted = extracted.slice(QR_PREFIX.length).substring(0, 4);
        }
        if (/^[A-Z0-9]{4}$/.test(extracted)) {
            setCode(extracted);
            setError(null);
        } else {
            setError('Could not read a valid join code from this QR code.');
        }
    }, []);

    const handleScanQR = useCallback(async () => {
        setError(null);
        try {
            const subscription = CameraView.onModernBarcodeScanned(({ data }) => {
                subscription.remove();
                CameraView.dismissScanner();
                handleCodeFromScan(data);
            });
            await CameraView.launchScanner({ barcodeTypes: ['qr'] });
        } catch {
            setError('Could not open the scanner. Please enter the code manually.');
        }
    }, [handleCodeFromScan]);

    // ── Manual join ───────────────────────────────────────────────────────────

    const handleJoin = useCallback(async () => {
        if (!deviceUser?.displayName) return;
        const trimmed = code.trim().toUpperCase();
        if (trimmed.length !== 4) {
            setError('Join code must be exactly 4 characters.');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const trip = await joinTrip({ joinCode: trimmed, displayName: deviceUser.displayName });
            await addTrip(trip);
            setActiveTripId(trip.id);
            router.replace(`/(trip)/${trip.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to join trip.');
        } finally {
            setLoading(false);
        }
    }, [code, deviceUser, addTrip, setActiveTripId, router]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.content}>
                    <Text style={[typography.heading, { color: colors.text }]}>
                        Join a Trip
                    </Text>
                    <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl }]}>
                        Scan the QR code from the trip creator, or type the 4-character code.
                    </Text>

                    {/* QR scan button */}
                    <Pressable
                        style={[styles.scanButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                        onPress={handleScanQR}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel="Scan QR code"
                    >
                        <Text style={styles.scanIcon}>📷</Text>
                        <Text style={[typography.bodyMd, { color: colors.text }]}>Scan QR Code</Text>
                    </Pressable>

                    {/* Divider */}
                    <View style={styles.dividerRow}>
                        <View style={[styles.dividerLine, { backgroundColor: colors.separator }]} />
                        <Text style={[typography.caption, { color: colors.textSecondary, marginHorizontal: spacing.sm }]}>
                            or enter code
                        </Text>
                        <View style={[styles.dividerLine, { backgroundColor: colors.separator }]} />
                    </View>

                    {/* Code input */}
                    <TextInput
                        style={[
                            styles.codeInput,
                            {
                                backgroundColor: colors.inputBg,
                                color: colors.text,
                                borderColor: error ? colors.danger : colors.cardBorder,
                            },
                        ]}
                        placeholder="E.g. AB1C"
                        placeholderTextColor={colors.placeholder}
                        value={code}
                        onChangeText={(v) => {
                            setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
                            if (error) setError(null);
                        }}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={4}
                        returnKeyType="go"
                        onSubmitEditing={handleJoin}
                        editable={!loading}
                        accessibilityLabel="Enter join code"
                    />

                    {error ? (
                        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>
                            {error}
                        </Text>
                    ) : null}

                    {/* Join button */}
                    <Pressable
                        style={[
                            styles.joinButton,
                            { backgroundColor: colors.accent },
                            (loading || code.length < 4) && styles.joinButtonDisabled,
                        ]}
                        onPress={handleJoin}
                        disabled={loading || code.length < 4}
                        accessibilityRole="button"
                        accessibilityLabel="Join trip"
                        accessibilityState={{ disabled: loading || code.length < 4 }}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '600' }]}>
                                Join Trip
                            </Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    flex: { flex: 1 },
    content: {
        flex: 1,
        padding: spacing.lg,
        paddingTop: spacing.xl,
    },
    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        height: 56,
        borderRadius: radii.md,
        borderWidth: 1,
        marginBottom: spacing.lg,
    },
    scanIcon: { fontSize: 22 },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    dividerLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
    codeInput: {
        height: 56,
        borderRadius: radii.md,
        borderWidth: 1.5,
        paddingHorizontal: spacing.md,
        fontSize: 22,
        fontWeight: '700',
        letterSpacing: 8,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    joinButton: {
        height: 56,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.sm,
    },
    joinButtonDisabled: { opacity: 0.45 },
});