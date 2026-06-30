/**
 * Toast.tsx
 *
 * Non-blocking ephemeral feedback overlay. Replaces Alert.alert for
 * success and info messages. Does NOT replace Alert for destructive
 * confirmations (use ConfirmModal for those).
 *
 * Design:
 *  - Slides in from the bottom, above any content, below the safe area.
 *  - Auto-dismisses after `duration` ms (default 3000).
 *  - Three variants: success (green), error (red), info (grey).
 *  - Accessible: accessibilityLiveRegion="polite" so VoiceOver announces it.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast({ message: 'Expense saved', variant: 'success' });
 *
 * Mount <ToastContainer /> once in _layout.tsx (inside AppErrorBoundary).
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Platform,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
    message: string;
    variant?: ToastVariant;
    /** Auto-dismiss delay in ms. Default: 3000. */
    duration?: number;
}

interface ToastContextValue {
    showToast: (options: ToastOptions) => void;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider + Container ──────────────────────────────────────────────────────

interface ToastState {
    message: string;
    variant: ToastVariant;
    key: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toast, setToast] = useState<ToastState | null>(null);
    const counter = useRef(0);
    const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const translateY = useRef(new Animated.Value(100)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const insets = useSafeAreaInsets();

    const dismiss = useCallback(() => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: 100,
                duration: 220,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
            }),
        ]).start(() => setToast(null));
    }, [translateY, opacity]);

    const showToast = useCallback(
        ({ message, variant = 'info', duration = 3000 }: ToastOptions) => {
            // Cancel any pending dismiss
            if (dismissTimer.current) clearTimeout(dismissTimer.current);

            // Reset animation to off-screen
            translateY.setValue(100);
            opacity.setValue(0);

            counter.current += 1;
            setToast({ message, variant, key: counter.current });

            // Slide in
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 4,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();

            dismissTimer.current = setTimeout(() => {
                dismiss();
            }, duration);
        },
        [translateY, opacity, dismiss],
    );

    const contextValue: ToastContextValue = { showToast };

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            {toast && (
                <Animated.View
                    key={toast.key}
                    style={[
                        styles.container,
                        variantStyles[toast.variant],
                        {
                            bottom: insets.bottom + 16,
                            transform: [{ translateY }],
                            opacity,
                        },
                    ]}
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={toast.message}
                    pointerEvents="none"
                >
                    <Text style={styles.message} numberOfLines={2}>
                        {toast.message}
                    </Text>
                </Animated.View>
            )}
        </ToastContext.Provider>
    );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used inside <ToastProvider>');
    }
    return ctx;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 20,
        right: 20,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        // Shadow
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 8,
            },
            android: { elevation: 6 },
        }),
        zIndex: 9999,
    },
    message: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
        textAlign: 'center',
    },
});

const variantStyles = StyleSheet.create({
    success: { backgroundColor: '#1a7f37' },
    error: { backgroundColor: '#b91c1c' },
    info: { backgroundColor: '#374151' },
});