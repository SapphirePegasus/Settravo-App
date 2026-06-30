/**
 * src/components/ui/Chip.tsx
 *
 * Selectable filter/category pill.
 * Selected state: accent background + white text.
 * Unselected state: card background + muted border.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography, radii, spacing } from '@/theme';

interface ChipProps {
    label: string;
    selected: boolean;
    onPress: () => void;
    icon?: string;  // optional leading emoji/icon
    accessibilityLabel?: string;
}

function ChipInner({ label, selected, onPress, icon, accessibilityLabel }: ChipProps) {
    const colors = useThemeColors();

    return (
        <Pressable
            style={({ pressed }) => [
                styles.chip,
                {
                    backgroundColor: selected ? colors.accent : colors.card,
                    borderColor: selected ? colors.accent : colors.cardBorder,
                    opacity: pressed ? 0.8 : 1,
                },
            ]}
            onPress={onPress}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={accessibilityLabel ?? label}
        >
            {icon ? <Text style={styles.icon}>{icon}</Text> : null}
            <Text
                style={[
                    typography.bodyMd,
                    { color: selected ? colors.textInverse : colors.text },
                ]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

export const Chip = React.memo(ChipInner);

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        borderRadius: radii.full,
        borderWidth: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    icon: { fontSize: 16 },
});