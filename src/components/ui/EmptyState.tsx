/**
 * src/components/ui/EmptyState.tsx
 *
 * Full-area empty state. Every list screen uses this instead of a blank void.
 *
 * Props
 * ─────
 * iconKey     — semantic icon key from src/config/icons.ts rendered at 64px.
 *               Defaults to "status.empty" (file-tray outline). To change the
 *               glyph, edit icons.ts — never touch this file or call sites.
 * title       — primary message (required)
 * subtitle    — secondary explanation (optional)
 * actionLabel — CTA button label (optional; requires onAction)
 * onAction    — CTA handler (optional)
 *
 * Icons are always rendered in outline/inactive form here — they are
 * decorative illustrations, not navigation affordances.
 *
 * MIGRATION NOTE
 * The old `illustration` prop (emoji string) has been removed.
 * Replace any remaining call sites:
 *   Before: <EmptyState illustration="🏕️" ... />
 *   After:  <EmptyState iconKey="nav.groups" ... />
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import type { IconKey } from '@/config/icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Button } from './Button';
import { typography, spacing } from '@/theme';

interface EmptyStateProps {
    /** Semantic icon key from src/config/icons.ts. Defaults to "status.empty". */
    iconKey?: IconKey;
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
}

function EmptyStateInner({
    iconKey = 'status.empty',
    title,
    subtitle,
    actionLabel,
    onAction,
}: EmptyStateProps) {
    const colors = useThemeColors();

    return (
        <View style={styles.container}>
            <View style={styles.iconWrapper}>
                <Icon
                    name={iconKey}
                    active={false}
                    size={64}
                    color={colors.icon}
                    accessibilityLabel={title}
                />
            </View>

            <Text style={[typography.title, { color: colors.text, textAlign: 'center' }]}>
                {title}
            </Text>

            {subtitle ? (
                <Text
                    style={[
                        typography.body,
                        {
                            color: colors.textSecondary,
                            textAlign: 'center',
                            marginTop: spacing.xs,
                        },
                    ]}
                >
                    {subtitle}
                </Text>
            ) : null}

            {actionLabel && onAction ? (
                <View style={styles.action}>
                    <Button
                        label={actionLabel}
                        onPress={onAction}
                        variant="primary"
                        size="md"
                    />
                </View>
            ) : null}
        </View>
    );
}

export const EmptyState = React.memo(EmptyStateInner);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.xxl,
    },
    iconWrapper: {
        marginBottom: spacing.md,
    },
    action: {
        marginTop: spacing.xl,
        width: '100%',
    },
});