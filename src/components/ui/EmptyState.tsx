/**
 * src/components/ui/EmptyState.tsx
 *
 * Full-area empty state. Every list screen must show this instead of blank void.
 *
 * Props:
 *   illustration — large emoji or icon character
 *   title        — primary message
 *   subtitle     — secondary explanation (optional)
 *   actionLabel  — CTA button label (optional)
 *   onAction     — CTA handler (optional)
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Button } from './Button';
import { typography, spacing } from '@/theme';

interface EmptyStateProps {
    illustration?: string;
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
}

function EmptyStateInner({
    illustration = '🗂️',
    title,
    subtitle,
    actionLabel,
    onAction,
}: EmptyStateProps) {
    const colors = useThemeColors();

    return (
        <View style={styles.container}>
            <Text style={styles.illustration}>{illustration}</Text>

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
    illustration: {
        fontSize: 64,
        marginBottom: spacing.md,
    },
    action: {
        marginTop: spacing.xl,
        width: '100%',
    },
});