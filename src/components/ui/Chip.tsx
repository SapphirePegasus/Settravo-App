/**
 * src/components/ui/Chip.tsx
 *
 * Selectable filter/category pill.
 * Selected state: accent background + white text.
 * Unselected state: card background + muted border.
 *
 * MIGRATION: `icon` prop (emoji string) replaced with `iconKey` (IconKey).
 * To change a chip icon, edit src/config/icons.ts — never touch this file.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import type { IconKey } from '@/config/icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography, radii, spacing } from '@/theme';

interface ChipProps {
    label: string;
    selected: boolean;
    onPress: () => void;
    /** Semantic icon key from src/config/icons.ts. Optional leading icon. */
    iconKey?: IconKey;
    accessibilityLabel?: string;
}

function ChipInner({ label, selected, onPress, iconKey, accessibilityLabel }: ChipProps) {
    const colors = useThemeColors();
    const iconColor = selected ? colors.textInverse : colors.textSecondary;

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
            {iconKey ? (
                <Icon
                    name={iconKey}
                    active={selected}
                    size={16}
                    color={iconColor}
                />
            ) : null}
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
});