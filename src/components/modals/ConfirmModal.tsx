/**
 * src/components/modals/ConfirmModal.tsx
 *
 * Reusable bottom-sheet confirmation dialog for all destructive actions.
 * Replaces Alert.alert for: delete expense, leave trip, unmark settlement,
 * remove guest member.
 *
 * NOTE: src/components/ui/ConfirmSheet.tsx is the newer, BottomSheet-based
 * equivalent for fresh code. This component is kept because 4 existing call
 * sites depend on its async onConfirm signature (ConfirmSheet's onConfirm is
 * sync-only). Full migration to ConfirmSheet is a deliberate follow-up once
 * all 4 callers can be updated to fire-and-forget pattern.
 *
 * Fix: replaced colors.accentDestructive → colors.danger
 * Fix: replaced colors.subText → colors.textSecondary
 * Fix: replaced colors.handleBar → colors.separator
 * Fix: replaced hardcoded '#fff' → colors.textInverse
 * Fix: replaced hardcoded '#000' shadow → neutral black is fine for shadows
 *      (shadows are always black-based per platform convention, kept as-is)
 *
 * Design unchanged: slide-up Animated sheet, scrim, safe-area aware.
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
import { typography, spacing, radii } from '@/theme';

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
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 14 }),
                Animated.timing(scrimOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: 400, duration: 240, easing: Easing.in(Easing.ease), useNativeDriver: true }),
                Animated.timing(scrimOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
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

    const confirmColor = confirmVariant === 'destructive' ? colors.danger : colors.accent;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onCancel}
        >
            {/* Scrim */}
            <Animated.View style={[styles.scrim, { opacity: scrimOpacity, backgroundColor: colors.overlay }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
            </Animated.View>

            {/* Sheet */}
            <Animated.View
                style={[
                    styles.sheet,
                    {
                        backgroundColor: colors.card,
                        paddingBottom: insets.bottom + spacing.md,
                        transform: [{ translateY }],
                    },
                ]}
            >
                <View style={[styles.handle, { backgroundColor: colors.separator }]} />

                <Text style={[typography.title, styles.title, { color: colors.text }]}>{title}</Text>
                <Text style={[typography.body, styles.message, { color: colors.textSecondary }]}>{message}</Text>

                <Pressable
                    style={[styles.confirmButton, { backgroundColor: confirmColor }]}
                    onPress={handleConfirm}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={confirmLabel}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.textInverse} />
                    ) : (
                        <Text style={[typography.bodyMd, styles.confirmLabel, { color: colors.textInverse }]}>
                            {confirmLabel}
                        </Text>
                    )}
                </Pressable>

                <Pressable
                    style={[styles.cancelButton, { borderColor: colors.separator }]}
                    onPress={onCancel}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                >
                    <Text style={[typography.bodyMd, { color: colors.text }]}>Cancel</Text>
                </Pressable>
            </Animated.View>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
        paddingTop: spacing.sm,
        paddingHorizontal: spacing.lg,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 12 },
            android: { elevation: 12 },
        }),
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: radii.full,
        alignSelf: 'center',
        marginBottom: spacing.lg,
    },
    title: {
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    message: {
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
    confirmButton: {
        height: 52,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.sm,
    },
    confirmLabel: {
        fontWeight: '600',
    },
    cancelButton: {
        height: 52,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
    },
});