/**
 * app/(auth)/onboarding.tsx
 *
 * Onboarding screen — the first and only screen in the (auth) route group.
 * Shown when: no deviceUser OR deviceUser.displayName === null.
 *
 * After successful name submission, navigates to /(tabs) with replace
 * (prevents back navigation to onboarding after setup is complete).
 *
 * Moved from: src/components/OnboardingScreen.tsx (deprecated — delete after this)
 */

import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { BlurView, BlurTargetView } from 'expo-blur';
import { ZodError } from 'zod';

import { AppAssets } from '@/theme/assets';
import { spacing, typography, radii } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { UpdateDisplayNameSchema } from '@/validation/schemas';

const PRIVACY_POLICY_URL = 'https://legal.sapphirepegasus.com/privacy-policy';

// Perf-conscious choice: only blurs on Android 12+ (SDK 31+, the efficient
// RenderNode path). Older Android falls back to 'none' — a plain
// semi-transparent view — rather than paying the RenderScript performance
// penalty per the Expo v55 docs' Performance guidance.
const ANDROID_BLUR_METHOD = 'dimezisBlurViewSdk31Plus';

export default function OnboardingScreen() {
    const router = useRouter();
    const setDisplayName = useAuthStore((s) => s.setDisplayName);

    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const inputRef = useRef<TextInput>(null);
    // The photo behind everything is the "target" all BlurViews sample from.
    // One BlurTargetView is enough for both the input and button blurs
    // (per docs — cheaper than one target per blur).
    const blurTargetRef = useRef<View | null>(null);

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleSubmit = useCallback(async () => {
        setError(null);

        try {
            UpdateDisplayNameSchema.parse({ displayName: name });
        } catch (err) {
            if (err instanceof ZodError) {
                setError(err.issues[0]?.message ?? 'Invalid name');
            }
            return;
        }

        setLoading(true);
        try {
            await setDisplayName(name.trim());
            router.replace('/(tabs)');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save name';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [name, setDisplayName, router]);

    const handleOpenPrivacyPolicy = useCallback(async () => {
        try {
            const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
            if (supported) {
                await Linking.openURL(PRIVACY_POLICY_URL);
            }
        } catch {
            // Non-critical navigation action — silently no-op on failure.
        }
    }, []);

    const isSubmitEnabled = name.trim().length > 0 && !loading;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={styles.root}>
            <StatusBar style="light" />

            {/* Everything visual that BlurViews will sample from lives inside
                this BlurTargetView — required for real blur on Android. */}
            <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
                <ImageBackground
                    source={AppAssets.onboardBg}
                    style={styles.bg}
                    resizeMode="cover"
                >
                    <View style={styles.scrim} />
                </ImageBackground>
            </BlurTargetView>

            <KeyboardAvoidingView
                style={styles.flex}
                // iOS: 'padding' works reliably out of the box.
                // Android: leave undefined — SDK 55 defaults to edge-to-edge,
                // which already handles resize via adjustResize. Adding
                // 'height' here double-resizes and causes the visible jump.
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.content}>
                    <Text style={styles.taglineLine1}>Split bills,</Text>
                    <Text style={styles.taglineLine2}>not friendship</Text>

                    <Text style={styles.subtitle}>
                        Enter your display name, create groups, add expenses, split
                        fairly — and a lot more, without the awkward maths.
                    </Text>

                    <View style={styles.spacer} />

                    <Text style={styles.inputLabel}>DISPLAY NAME</Text>

                    {/* Frosted-glass input — BlurView supplies the blur,
                        overflow: 'hidden' is required since BlurView ignores
                        borderRadius directly (per docs). */}
                    <BlurView
                        blurTarget={blurTargetRef}
                        blurMethod={ANDROID_BLUR_METHOD}
                        intensity={40}
                        tint="dark"
                        style={[
                            styles.inputBlur,
                            error ? styles.inputBlurError : null,
                        ]}
                    >
                        <TextInput
                            ref={inputRef}
                            style={styles.input}
                            placeholderTextColor="rgba(255,255,255,0.45)"
                            value={name}
                            onChangeText={(t) => {
                                setName(t);
                                if (error) setError(null);
                            }}
                            // autoFocus intentionally removed — keyboard should
                            // only appear once the user taps the field.
                            autoCorrect={false}
                            autoCapitalize="words"
                            returnKeyType="done"
                            onSubmitEditing={handleSubmit}
                            maxLength={50}
                            accessibilityLabel="Enter your display name"
                        />
                    </BlurView>

                    {error ? (
                        <Text style={styles.errorText}>{error}</Text>
                    ) : null}

                    {/* Frosted-glass CTA — blur + a translucent green tint on
                        top keeps brand color while still reading as glass. */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            pressed && isSubmitEnabled && styles.buttonPressed,
                        ]}
                        onPress={handleSubmit}
                        disabled={!isSubmitEnabled}
                        accessibilityRole="button"
                        accessibilityLabel="Get Started"
                        accessibilityState={{ disabled: !isSubmitEnabled }}
                    >
                        <BlurView
                            blurTarget={blurTargetRef}
                            blurMethod={ANDROID_BLUR_METHOD}
                            intensity={55}
                            tint="dark"
                            style={StyleSheet.absoluteFill}
                        />
                        <View
                            style={[
                                StyleSheet.absoluteFill,
                                styles.buttonTint,
                                !isSubmitEnabled && styles.buttonTintDisabled,
                            ]}
                            pointerEvents="none"
                        />
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.buttonLabel}>Get Started</Text>
                        )}
                    </Pressable>

                    <Pressable
                        onPress={handleOpenPrivacyPolicy}
                        hitSlop={8}
                        accessibilityRole="link"
                        accessibilityLabel="Read our Privacy Policy"
                        style={({ pressed }) => [
                            styles.privacyLink,
                            pressed && styles.privacyLinkPressed,
                        ]}
                    >
                        <Text style={styles.privacyLinkText}>Privacy Policy</Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// All colors here are intentionally hardcoded white/transparent/green —
// this screen always renders over a dark-ish photo regardless of theme mode.

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    bg: {
        flex: 1,
    },
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    flex: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing.lg,
        paddingTop: 100,
        paddingBottom: spacing.xxl,
        justifyContent: 'flex-end',
    },
    taglineLine1: {
        ...typography.display,
        color: '#14532D', // palette.green900
        marginBottom: spacing.xs,
        textShadowColor: 'rgba(255,255,255,0.55)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
    },
    taglineLine2: {
        ...typography.display,
        color: '#14532D', // palette.green900
        marginBottom: spacing.lg,
        textShadowColor: 'rgba(255,255,255,0.55)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
    },
    subtitle: {
        ...typography.body,
        color: 'rgba(255,255,255,0.85)',
        marginBottom: spacing.xl,
    },
    spacer: {
        flex: 1,
    },
    inputLabel: {
        ...typography.label,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: spacing.sm,
    },
    inputBlur: {
        height: 52,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.4)',
        overflow: 'hidden', // required: BlurView ignores borderRadius directly
        marginBottom: spacing.sm,
    },
    inputBlurError: {
        borderColor: '#F87171',
    },
    input: {
        flex: 1,
        paddingHorizontal: spacing.md,
        ...typography.body,
        color: '#FFFFFF',
    },
    errorText: {
        ...typography.caption,
        color: '#FCA5A5',
        marginBottom: spacing.md,
    },
    button: {
        height: 56,
        borderRadius: radii.md,
        overflow: 'hidden', // required: BlurView ignores borderRadius directly
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.md,
    },
    buttonTint: {
        backgroundColor: 'rgba(34,197,94,0.55)', // green500 @ 55% — glass CTA
    },
    buttonTintDisabled: {
        backgroundColor: 'rgba(34,197,94,0.25)',
    },
    buttonPressed: {
        opacity: 0.85,
    },
    buttonLabel: {
        ...typography.bodyMd,
        fontWeight: '600',
        color: '#FFFFFF',
        fontSize: 16,
    },
    privacyLink: {
        alignSelf: 'center',
        marginTop: spacing.lg,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
    },
    privacyLinkPressed: {
        opacity: 0.6,
    },
    privacyLinkText: {
        ...typography.caption,
        color: 'rgba(255,255,255,0.65)',
        textDecorationLine: 'underline',
    },
});