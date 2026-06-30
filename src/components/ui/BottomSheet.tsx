/**
 * src/components/ui/BottomSheet.tsx
 *
 * Reusable bottom sheet modal. Replaces all ad-hoc Modal + absolute-position
 * patterns across the app.
 *
 * Renders as a Modal with:
 *   - Scrim (tapable to dismiss)
 *   - Rounded top sheet with drag handle
 *   - Safe-area bottom padding
 *   - Slide animation
 *
 * Phase E will upgrade to Reanimated spring + gesture drag-to-dismiss.
 * For now: native Modal with slide animation is sufficient and zero-dep.
 */

import React from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { radii, shadows, spacing } from '@/theme';

interface BottomSheetProps {
    visible: boolean;
    onDismiss: () => void;
    children: React.ReactNode;
    /** Extra style for the sheet container */
    sheetStyle?: StyleProp<ViewStyle>;
    /** Whether tapping the scrim dismisses the sheet (default true) */
    dismissOnScrim?: boolean;
}

export function BottomSheet({
    visible,
    onDismiss,
    children,
    sheetStyle,
    dismissOnScrim = true,
}: BottomSheetProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onDismiss}
            hardwareAccelerated
        >
            {/* Scrim */}
            <Pressable
                style={[styles.scrim, { backgroundColor: colors.overlay }]}
                onPress={dismissOnScrim ? onDismiss : undefined}
                accessibilityRole="button"
                accessibilityLabel="Close"
            />

            {/* Sheet */}
            <View
                style={[
                    styles.sheet,
                    {
                        backgroundColor: colors.surface,
                        paddingBottom: insets.bottom + spacing.md,
                        ...shadows.high,
                    },
                    sheetStyle,
                ]}
            >
                {/* Drag handle */}
                <View style={styles.handleContainer}>
                    <View style={[styles.handle, { backgroundColor: colors.separator }]} />
                </View>

                {children}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: {
        flex: 1,
    },
    sheet: {
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
        paddingTop: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    handleContainer: {
        alignItems: 'center',
        paddingBottom: spacing.md,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: radii.full,
    },
});