/**
 * app/(auth)/onboarding.tsx
 *
 * Onboarding screen — the first and only screen in the (auth) route group.
 * Shown when: no deviceUser OR deviceUser.displayName === null.
 *
 * After successful name submission, navigates to /(tabs) with replace
 * (prevents back navigation to onboarding after setup is complete).
 *
 * Layout (per spec):
 *  - Full-bleed onboardbg.png via ImageBackground (StyleSheet.absoluteFill)
 *  - Centered KeyboardAvoidingView with the form content
 *  - App wordmark, tagline, name input, Get Started button
 *  - Status bar: white (image background is dark-ish)
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
import { ZodError } from 'zod';

import { AppAssets } from '@/theme/assets';
import { spacing, typography, radii } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { UpdateDisplayNameSchema } from '@/validation/schemas';

export default function OnboardingScreen() {
    const router = useRouter();
    const setDisplayName = useAuthStore((s) => s.setDisplayName);

    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const inputRef = useRef<TextInput>(null);

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleSubmit = useCallback(async () => {
        setError(null);

        // Client-side validation (mirrors server-side Zod schema)
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
            // Root layout re-evaluates: deviceUser.displayName is now set → shows (tabs)
            router.replace('/(tabs)');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save name';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [name, setDisplayName, router]);

    const isSubmitEnabled = name.trim().length > 0 && !loading;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <StatusBar style="light" />
            <ImageBackground
                source={AppAssets.onboardBg}
                style={styles.bg}
                resizeMode="cover"
            >
                {/* Scrim — ensures text is readable regardless of image brightness */}
                <View style={styles.scrim} />

                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.content}>
                        {/* Wordmark */}
                        <Text style={styles.wordmark}>Settravo</Text>

                        {/* Tagline */}
                        <Text style={styles.tagline}>Split bills,</Text>
                        <Text style={styles.taglineSub}>not friendship</Text>

                        <View style={styles.spacer} />

                        {/* Name label */}
                        <Text style={styles.inputLabel}>YOUR NAME</Text>

                        {/* Name input */}
                        <TextInput
                            ref={inputRef}
                            style={[
                                styles.input,
                                error ? styles.inputError : null,
                            ]}
                            placeholder="e.g. Alex"
                            placeholderTextColor="rgba(255,255,255,0.45)"
                            value={name}
                            onChangeText={(t) => {
                                setName(t);
                                if (error) setError(null);
                            }}
                            autoFocus
                            autoCorrect={false}
                            autoCapitalize="words"
                            returnKeyType="done"
                            onSubmitEditing={handleSubmit}
                            maxLength={50}
                            accessibilityLabel="Enter your display name"
                        />

                        {/* Inline error */}
                        {error ? (
                            <Text style={styles.errorText}>{error}</Text>
                        ) : null}

                        {/* CTA */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.button,
                                !isSubmitEnabled && styles.buttonDisabled,
                                pressed && isSubmitEnabled && styles.buttonPressed,
                            ]}
                            onPress={handleSubmit}
                            disabled={!isSubmitEnabled}
                            accessibilityRole="button"
                            accessibilityLabel="Get Started"
                            accessibilityState={{ disabled: !isSubmitEnabled }}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.buttonLabel}>Get Started</Text>
                            )}
                        </Pressable>
                    </View>
                </KeyboardAvoidingView>
            </ImageBackground>
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// All colors here are intentionally hardcoded white/transparent — this screen
// always renders over a dark background image regardless of theme mode.

const styles = StyleSheet.create({
    bg: {
        flex: 1,
    },
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
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
    wordmark: {
        ...typography.heading,
        color: '#22C55E',  // always accent green on onboard regardless of user preference
        marginBottom: spacing.sm,
        position: 'absolute',
        top: 80,
        left: spacing.lg,
    },
    tagline: {
        ...typography.display,
        color: '#FFFFFF',
        marginBottom: 0,
    },
    taglineSub: {
        ...typography.display,
        color: 'rgba(255,255,255,0.75)',
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
    input: {
        height: 52,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: spacing.md,
        ...typography.body,
        color: '#FFFFFF',
        marginBottom: spacing.sm,
    },
    inputError: {
        borderColor: '#F87171',
    },
    errorText: {
        ...typography.caption,
        color: '#FCA5A5',
        marginBottom: spacing.md,
    },
    button: {
        height: 56,
        borderRadius: radii.md,
        backgroundColor: '#22C55E',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.md,
    },
    buttonDisabled: {
        opacity: 0.45,
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
});