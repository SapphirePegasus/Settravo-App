/**
 * src/components/ui/ConfirmSheet.tsx
 *
 * Destructive action confirmation bottom sheet.
 * Replaces src/components/modals/ConfirmModal.tsx for new code.
 * ConfirmModal is kept for legacy compatibility until Phase D.
 *
 * confirmVariant:
 *   'primary'     — accent color confirm button
 *   'destructive' — danger color confirm button (default for irreversible actions)
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { typography, spacing } from '@/theme';

export type ConfirmVariant = 'primary' | 'destructive';

interface ConfirmSheetProps {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    confirmVariant?: ConfirmVariant;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmSheet({
    visible,
    title,
    message,
    confirmLabel,
    cancelLabel = 'Cancel',
    confirmVariant = 'destructive',
    onConfirm,
    onCancel,
}: ConfirmSheetProps) {
    const colors = useThemeColors();

    return (
        <BottomSheet
            visible={visible}
            onDismiss={onCancel}
            dismissOnScrim={false}
        >
            <View style={styles.content}>
                <Text style={[typography.title, { color: colors.text, marginBottom: spacing.sm }]}>
                    {title}
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
                    {message}
                </Text>

                <View style={styles.actions}>
                    <Button
                        label={cancelLabel}
                        onPress={onCancel}
                        variant="ghost"
                        size="md"
                        fullWidth
                    />
                    <Button
                        label={confirmLabel}
                        onPress={onConfirm}
                        variant={confirmVariant === 'destructive' ? 'destructive' : 'primary'}
                        size="md"
                        fullWidth
                    />
                </View>
            </View>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: spacing.xs,
    },
    actions: {
        gap: spacing.sm,
    },
});