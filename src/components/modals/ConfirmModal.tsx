/**
 * ConfirmModal.tsx
 *
 * Reusable bottom-sheet confirmation dialog for all destructive actions.
 * Replaces Alert.alert for: delete expense, leave trip, unmark settlement,
 * remove guest member.
 *
 * Do NOT use for non-destructive confirmations — those don't need a modal.
 *
 * Design:
 *  - Modal slides up from the bottom (translateY animation).
 *  - Dark scrim covers content behind it.
 *  - Two buttons: Cancel (secondary) and Confirm (destructive or primary).
 *  - Loading spinner inside Confirm button while onConfirm is in-flight.
 *  - Dismissible by tapping the scrim (calls onCancel).
 *  - Safe-area aware: respects home indicator on notched devices.
 *
 * Usage:
 *   <ConfirmModal
 *     visible={showDelete}
 *     title="Delete expense?"
 *     message="This cannot be undone."
 *     confirmLabel="Delete"
 *     confirmVariant="destructive"
 *     onConfirm={handleDelete}
 *     onCancel={() => setShowDelete(false)}
 *   />
 */

import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';

export interface ConfirmModalProps {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    confirmVariant: 'destructive' | 'primary';
    onConfirm: () => Promise<void> | void;
    onCancel: () => void;
}

export function ConfirmModal({
    visible,
    title,
    message,
    confirmLabel,
    confirmVariant,
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(false);

    const translateY = useRef(new Animated.Value(400)).current;
    const scrimOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 3,
                    speed: 14,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: 400,
                    duration: 240,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, translateY, scrimOpacity]);

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
        } finally {
            setLoading(false);
        }
    };

    const confirmColor =
        confirmVariant === 'destructive' ? colors.accentDestructive : colors.accent;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onCancel}
        >
            {/* Scrim */}
            <Animated.View
                style={[styles.scrim, { opacity: scrimOpacity }]}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
            </Animated.View>

            {/* Sheet */}
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
                {/* Handle bar */}
                <View style={[styles.handle, { backgroundColor: colors.handleBar }]} />

                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.message, { color: colors.subText }]}>{message}</Text>

                <Pressable
                    style={[styles.confirmButton, { backgroundColor: confirmColor }]}
                    onPress={handleConfirm}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={confirmLabel}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.confirmLabel}>{confirmLabel}</Text>
                    )}
                </Pressable>

                <Pressable
                    style={[styles.cancelButton, { borderColor: colors.separator }]}
                    onPress={onCancel}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                >
                    <Text style={[styles.cancelLabel, { color: colors.text }]}>Cancel</Text>
                </Pressable>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 8,
        paddingHorizontal: 20,
        // Shadow
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.12,
                shadowRadius: 12,
            },
            android: { elevation: 12 },
        }),
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 28,
    },
    confirmButton: {
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    confirmLabel: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
    },
    cancelLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
});