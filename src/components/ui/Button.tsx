/**
 * src/components/ui/Button.tsx
 *
 * Primary action button. Four variants, three sizes, loading + disabled states.
 *
 * Variants:
 *   primary     — accent background, white text. Main CTA.
 *   secondary   — transparent background, accent border + text. Secondary action.
 *   ghost       — no border, accent text. Inline/subtle action.
 *   destructive — danger background/text. Irreversible actions.
 *
 * Sizes:
 *   sm  — 36pt height, small text
 *   md  — 48pt height (default)
 *   lg  — 56pt height, large text
 *
 * Loading: shows ActivityIndicator, preserves width, disables interaction.
 * Disabled: opacity 0.4, non-interactive.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography, radii, spacing } from '@/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
    label: string;
    onPress: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    accessibilityLabel?: string;
}

// ─── Size configs ─────────────────────────────────────────────────────────────

const SIZE = {
    sm: { height: 36, fontSize: 13, paddingH: spacing.md },
    md: { height: 48, fontSize: 15, paddingH: spacing.lg },
    lg: { height: 56, fontSize: 17, paddingH: spacing.lg },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

function ButtonInner({
    label,
    onPress,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = false,
    accessibilityLabel,
}: ButtonProps) {
    const colors = useThemeColors();
    const cfg = SIZE[size];
    const isInert = disabled || loading;

    // ── Variant styles ────────────────────────────────────────────────────────

    const bg = {
        primary: colors.accent,
        secondary: 'transparent',
        ghost: 'transparent',
        destructive: colors.danger,
    }[variant];

    const textColor = {
        primary: colors.textInverse,
        secondary: colors.accent,
        ghost: colors.accent,
        destructive: colors.textInverse,
    }[variant];

    const borderColor = variant === 'secondary' ? colors.accent : 'transparent';
    const borderWidth = variant === 'secondary' ? 1.5 : 0;

    return (
        <Pressable
            style={({ pressed }) => [
                styles.base,
                {
                    height: cfg.height,
                    paddingHorizontal: cfg.paddingH,
                    backgroundColor: bg,
                    borderColor,
                    borderWidth,
                    borderRadius: radii.md,
                    alignSelf: fullWidth ? undefined : 'auto',
                    opacity: isInert ? 0.4 : pressed ? 0.85 : 1,
                },
                fullWidth && styles.fullWidth,
            ]}
            onPress={onPress}
            disabled={isInert}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled: isInert, busy: loading }}
        >
            {loading ? (
                <ActivityIndicator
                    color={variant === 'primary' || variant === 'destructive' ? colors.textInverse : colors.accent}
                    size="small"
                />
            ) : (
                <Text
                    style={[
                        styles.label,
                        { color: textColor, fontSize: cfg.fontSize },
                    ]}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            )}
        </Pressable>
    );
}

export const Button = React.memo(ButtonInner);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullWidth: {
        alignSelf: 'stretch',
    },
    label: {
        fontWeight: '600',
        textAlign: 'center',
    },
});