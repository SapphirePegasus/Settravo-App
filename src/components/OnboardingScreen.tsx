/**
 * OnboardingScreen.tsx
 *
 * Shown exactly once: after anonymous auth succeeds but before the user
 * has set a display name. Blocks the main navigation stack until the user
 * enters a name.
 *
 * Design decisions:
 *  - Uses system font (no font loading dependency).
 *  - Respects dark/light scheme passed down from the root layout.
 *  - The name is validated by Zod (UpdateDisplayNameSchema) before submission.
 *  - On success, authStore.setDisplayName() updates the store, which causes
 *    the root layout to re-render and show the main Stack.
 *  - Keyboard-aware: KeyboardAvoidingView ensures the button stays visible.
 */

import { useState } from 'react';
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
import { ZodError } from 'zod';
import { useAuthStore } from '../stores/authStore';
import { UpdateDisplayNameSchema } from '../validation/schemas';
import { useThemeColors } from '../hooks/useThemeColors';


export function OnboardingScreen() {
    const setDisplayName = useAuthStore((s) => s.setDisplayName);

    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const colors = useThemeColors();

    async function handleSubmit() {
        setError(null);

        // Client-side validation before hitting the network
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
            // Root layout re-renders automatically when deviceUser.displayName is set
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save name';
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={[styles.root, { backgroundColor: colors.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.inner}>
                <Text style={[styles.heading, { color: colors.text }]}>What's your name?</Text>
                <Text style={[styles.subheading, { color: colors.subText }]}>
                    This is how you'll appear to others in shared trips.
                </Text>

                <TextInput
                    style={[
                        styles.input,
                        {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: error ? colors.error : colors.border,
                        },
                    ]}
                    placeholder="Your name"
                    placeholderTextColor={colors.placeholder}
                    value={name}
                    onChangeText={(v) => {
                        setName(v);
                        if (error) setError(null);
                    }}
                    autoFocus
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    maxLength={50}
                    editable={!loading}
                />

                {error ? (
                    <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                ) : null}

                <Pressable
                    style={[styles.button, { backgroundColor: colors.buttonBg, opacity: loading ? 0.7 : 1 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#ffffff" />
                    ) : (
                        <Text style={styles.buttonText}>Continue</Text>
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    inner: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    heading: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 8,
    },
    subheading: {
        fontSize: 16,
        marginBottom: 32,
        lineHeight: 22,
    },
    input: {
        height: 52,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        fontSize: 17,
        marginBottom: 8,
    },
    errorText: {
        fontSize: 13,
        marginBottom: 8,
        marginLeft: 4,
    },
    button: {
        height: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '600',
    },
});

// ─── Color tokens ─────────────────────────────────────────────────────────────
// Using iOS system palette values — these match the system appearance precisely.

const light = {
    bg: '#f2f2f7',
    text: '#000000',
    subText: '#6c6c70',
    inputBg: '#ffffff',
    border: '#c6c6c8',
    placeholder: '#8e8e93',
    buttonBg: '#007aff',
    error: '#ff3b30',
};

const dark = {
    bg: '#000000',
    text: '#ffffff',
    subText: '#8e8e93',
    inputBg: '#1c1c1e',
    border: '#38383a',
    placeholder: '#636366',
    buttonBg: '#0a84ff',
    error: '#ff453a',
};