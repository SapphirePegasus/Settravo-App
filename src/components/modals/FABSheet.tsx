/**
 * src/components/modals/FABSheet.tsx
 *
 * Bottom sheet shown when the center [+] FAB is tapped.
 * Options:
 *   - Create New Group → navigates to (trip)/create
 *   - Create Expense → shows group picker (MemberPickerSheet) then navigates
 *
 * Uses a simple Modal with slide-up animation (no external sheet library).
 * Reanimated-driven spring in Phase E — for now uses React Native's default.
 *
 * If currentTripId is provided, the "Create Expense" option skips the
 * group picker and goes directly to add-expense for that trip.
 */

import React, { useCallback } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTrips } from '@/hooks/useTrips';
import { spacing, typography, radii, shadows } from '@/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FABSheetProps {
    visible: boolean;
    onDismiss: () => void;
    onCreateGroup: () => void;
    /** Called with the selected tripId */
    onCreateExpense: (tripId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FABSheet({ visible, onDismiss, onCreateGroup, onCreateExpense }: FABSheetProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { trips } = useTrips();

    const handleCreateExpense = useCallback((tripId: string) => {
        onCreateExpense(tripId);
    }, [onCreateExpense]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onDismiss}
        >
            {/* Scrim */}
            <Pressable style={styles.scrim} onPress={onDismiss} />

            {/* Sheet */}
            <View
                style={[
                    styles.sheet,
                    {
                        backgroundColor: colors.surface,
                        paddingBottom: insets.bottom + spacing.md,
                    },
                ]}
            >
                {/* Handle */}
                <View style={[styles.handle, { backgroundColor: colors.separator }]} />

                <Text style={[styles.sheetTitle, { color: colors.textSecondary }]}>
                    WHAT DO YOU WANT TO DO?
                </Text>

                {/* Create Group */}
                <Pressable
                    style={({ pressed }) => [
                        styles.option,
                        { backgroundColor: colors.card },
                        pressed && styles.optionPressed,
                    ]}
                    onPress={onCreateGroup}
                    accessibilityRole="button"
                    accessibilityLabel="Create new group"
                >
                    <Text style={styles.optionEmoji}>🏕️</Text>
                    <View style={styles.optionText}>
                        <Text style={[typography.bodyMd, { color: colors.text }]}>
                            Create New Group
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            Start a new trip or event
                        </Text>
                    </View>
                </Pressable>

                {/* Create Expense (shows trip picker inline if multiple trips) */}
                <View style={[styles.option, { backgroundColor: colors.card }]}>
                    <Text style={styles.optionEmoji}>💸</Text>
                    <View style={styles.optionText}>
                        <Text style={[typography.bodyMd, { color: colors.text }]}>
                            Create Expense
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            Add to a group
                        </Text>
                    </View>
                </View>

                {/* Trip picker — inline list when creating expense */}
                {trips.length > 0 && (
                    <View style={styles.tripList}>
                        {trips.map((trip) => (
                            <Pressable
                                key={trip.id}
                                style={({ pressed }) => [
                                    styles.tripOption,
                                    { borderColor: colors.cardBorder },
                                    pressed && styles.optionPressed,
                                ]}
                                onPress={() => handleCreateExpense(trip.id)}
                                accessibilityRole="button"
                                accessibilityLabel={`Add expense to ${trip.name}`}
                            >
                                <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
                                    {trip.name}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                )}
            </View>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrim: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
        paddingTop: spacing.sm,
        paddingHorizontal: spacing.md,
        ...shadows.high,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: radii.full,
        alignSelf: 'center',
        marginBottom: spacing.md,
    },
    sheetTitle: {
        ...typography.label,
        marginBottom: spacing.md,
        paddingLeft: spacing.xs,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.md,
        marginBottom: spacing.sm,
    },
    optionPressed: {
        opacity: 0.75,
    },
    optionEmoji: {
        fontSize: 28,
    },
    optionText: {
        flex: 1,
    },
    tripList: {
        marginTop: spacing.xs,
        gap: spacing.xs,
    },
    tripOption: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radii.sm,
        borderWidth: 1,
    },
});