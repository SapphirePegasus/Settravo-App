/**
 * app/(trip)/join.tsx — Join Trip screen
 *
 * Two join methods:
 *  1. QR code scan via CameraView.launchScanner()
 *     Uses the system scanner (DataScannerViewController on iOS 16+,
 *     Google code scanner on Android). This avoids the SDK 55 bug where
 *     CameraView + onBarcodeScanned silently disables on iOS EAS builds
 *     (github.com/expo/expo/issues/44491).
 *
 *  2. Manual code entry — 4-char input with auto-uppercase.
 *
 * QR payload format: "settravo://join?code=XXXXXX"
 * This lets us deep-link directly from a browser share too.
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
    useColorScheme,
    View,
} from 'react-native';
import { joinTrip } from '../../services/tripService';
import { useAuthStore } from '../../stores/authStore';
import { useTripStore } from '../../stores/tripStore';

const QR_PREFIX = 'settravo://join?code=';

export default function JoinScreen() {
    const router = useRouter();
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = isDark ? dark : light;

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const addTrip = useTripStore((s) => s.addTrip);
    const setActiveTripId = useTripStore((s) => s.setActiveTripId);

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCodeFromScan = useCallback((raw: string) => {
        let extracted = raw.trim().toUpperCase();
        if (extracted.startsWith(QR_PREFIX.toUpperCase())) {
            extracted = extracted.slice(QR_PREFIX.length).substring(0, 4);
        }
        if (/^[A-Z0-9]{4}$/.test(extracted)) {
            setCode(extracted);
        } else {
            setError('Could not read a valid join code from this QR code.');
        }
    }, []);

    const handleScanQR = useCallback(async () => {
        setError(null);
        try {
            // launchScanner uses DataScannerViewController on iOS 16+, Google code scanner on Android.
            // It presents a full-screen system modal — no camera permission prompt needed separately.
            const subscription = CameraView.onModernBarcodeScanned(({ data }) => {
                subscription.remove();
                CameraView.dismissScanner();
                handleCodeFromScan(data);
            });
            await CameraView.launchScanner({ barcodeTypes: ['qr'] });
        } catch (err) {
            setError('Could not open the scanner. Please enter the code manually.');
        }
    }, [handleCodeFromScan]);

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
            const trip = await joinTrip({
                joinCode: trimmed,
                displayName: deviceUser.displayName,
            });
            await addTrip(trip);
            setActiveTripId(trip.id);
            // Navigate to the trip, replacing the join screen
            router.replace(`/(trip)/${trip.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to join trip.');
        } finally {
            setLoading(false);
        }
    }, [code, deviceUser, addTrip, setActiveTripId, router]);

    return (
        <KeyboardAvoidingView
            style={[styles.root, { backgroundColor: colors.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.content}>
                <Text style={[styles.heading, { color: colors.text }]}>Join a Trip</Text>
                <Text style={[styles.sub, { color: colors.subText }]}>
                    Scan the QR code from the trip creator, or type the 4-character code.
                </Text>

                {/* QR scan button */}
                <Pressable
                    style={[styles.scanButton, { backgroundColor: colors.card }]}
                    onPress={handleScanQR}
                    disabled={loading}
                >
                    <Text style={[styles.scanIcon]}>📷</Text>
                    <Text style={[styles.scanText, { color: colors.text }]}>Scan QR Code</Text>
                </Pressable>

                <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.subText }]}>or enter code</Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                {/* Manual code input */}
                <TextInput
                    style={[
                        styles.codeInput,
                        { backgroundColor: colors.inputBg, color: colors.text, borderColor: error ? colors.error : colors.border },
                    ]}
                    placeholder="E.g. ABC3"
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
                />

                {error ? (
                    <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                ) : null}

                <Pressable
                    style={[styles.joinButton, { backgroundColor: colors.accent, opacity: loading || code.length < 4 ? 0.6 : 1 }]}
                    onPress={handleJoin}
                    disabled={loading || code.length < 4}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.joinText}>Join Trip</Text>
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { flex: 1, padding: 24, justifyContent: 'center' },
    heading: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
    sub: { fontSize: 15, lineHeight: 22, marginBottom: 32 },
    scanButton: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, marginBottom: 24 },
    scanIcon: { fontSize: 24 },
    scanText: { fontSize: 17, fontWeight: '500' },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
    dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
    dividerText: { fontSize: 13 },
    codeInput: { height: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, fontSize: 22, fontWeight: '600', textAlign: 'center', letterSpacing: 4, marginBottom: 8 },
    errorText: { fontSize: 13, marginBottom: 12 },
    joinButton: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    joinText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

const light = { bg: '#f2f2f7', text: '#000000', subText: '#6c6c70', card: '#ffffff', inputBg: '#ffffff', border: '#c6c6c8', placeholder: '#8e8e93', accent: '#007aff', error: '#ff3b30' };
const dark = { bg: '#000000', text: '#ffffff', subText: '#8e8e93', card: '#1c1c1e', inputBg: '#1c1c1e', border: '#38383a', placeholder: '#636366', accent: '#0a84ff', error: '#ff453a' };