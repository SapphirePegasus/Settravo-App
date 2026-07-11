/**
 * src/components/modals/FABSheet.tsx
 *
 * Bottom sheet shown when the center [+] FAB is tapped.
 * Options:
 *   - Create New Group → navigates to (trip)/create
 *   - Create Expense → shows group picker inline then navigates
 *
 * All emoji replaced with <Icon /> components.
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

import { Icon } from '../ui/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTrips } from '@/hooks/useTrips';
import { spacing, typography, radii, shadows } from '@/theme';

interface FABSheetProps {
    visible: boolean;
    onDismiss: () => void;
    onJoinGroup: () => void;
    onCreateGroup: () => void;
    onCreateExpense: (tripId: string) => void;
}

export function FABSheet({ visible, onDismiss, onJoinGroup, onCreateGroup, onCreateExpense }: FABSheetProps) {
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
                <View style={[styles.handle, { backgroundColor: colors.separator }]} />

                <Text style={[styles.sheetTitle, { color: colors.textSecondary }]}>
                    WHAT DO YOU WANT TO DO?
                </Text>

                {/* Join Group — first position */}
                <Pressable
                    style={({ pressed }) => [
                        styles.option,
                        { backgroundColor: colors.card },
                        pressed && styles.optionPressed,
                    ]}
                    onPress={onJoinGroup}
                    accessibilityRole="button"
                    accessibilityLabel="Join an existing group"
                >
                    <View style={[styles.optionIconBox, { backgroundColor: colors.accentLight }]}>
                        <Icon name="action.qrCode" size={24} color={colors.accent} />
                    </View>
                    <View style={styles.optionText}>
                        <Text style={[typography.bodyMd, { color: colors.text }]}>
                            Join Group
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            Scan QR or enter a code
                        </Text>
                    </View>
                    <Icon name="header.forward" size={18} color={colors.icon} />
                </Pressable>

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
                    <View style={[styles.optionIconBox, { backgroundColor: colors.accentLight }]}>
                        <Icon name="nav.groups" size={24} color={colors.accent} />
                    </View>
                    <View style={styles.optionText}>
                        <Text style={[typography.bodyMd, { color: colors.text }]}>
                            Create New Group
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            Start a new trip or event
                        </Text>
                    </View>
                    <Icon name="header.forward" size={18} color={colors.icon} />
                </Pressable>

                {/* Create Expense */}
                {/*<View style={[styles.option, { backgroundColor: colors.card }]}>
                    <View style={[styles.optionIconBox, { backgroundColor: colors.accentLight }]}>
                        <Icon name="money.receipt" size={24} color={colors.accent} />
                    </View>
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
                {/*trips.length > 0 && (
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
                                <Icon name="header.forward" size={16} color={colors.icon} />
                            </Pressable>
                        ))}
                    </View>
                )*/}
            </View>
        </Modal>
    );
}

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
    optionPressed: { opacity: 0.75 },
    optionIconBox: {
        width: 44,
        height: 44,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    optionText: { flex: 1 },
    tripList: {
        marginTop: spacing.xs,
        gap: spacing.xs,
    },
    tripOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radii.sm,
        borderWidth: 1,
    },
});