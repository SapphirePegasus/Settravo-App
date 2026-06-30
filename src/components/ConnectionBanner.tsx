/**
 * src/components/ConnectionBanner.tsx
 *
 * Overlay banner showing connection status. Does NOT shift layout —
 * uses absolute positioning to sit on top of content.
 *
 * States:
 *  - offline:      device has no network            → colors.textDisabled bg
 *  - reconnecting: realtime channel dropped, retrying → colors.warning bg
 *  - disconnected (max retries): "Tap to retry"        → colors.warning bg
 *
 * Fix: this component previously had ZERO theme awareness — fully hardcoded
 * hex colors (#636366, #ff9f0a, #fff). It never adapted to dark mode or the
 * user's accent preference. Now fully driven by useThemeColors().
 *
 * Business logic unchanged: connectionStore selectors, max-retry detection.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';
import { useConnectionStore } from '../stores/connectionStore';
import { typography, spacing, radii } from '@/theme';

interface ConnectionBannerProps {
    /** Called when the user taps "Tap to retry" after max reconnect attempts. */
    onReconnect?: () => void;
}

export function ConnectionBanner({ onReconnect }: ConnectionBannerProps) {
    const colors = useThemeColors();

    const connectionStatus = useConnectionStore((s) => s.connectionStatus);
    const realtimeStatus = useConnectionStore((s) => s.realtimeStatus);
    const channelMounted = useConnectionStore((s) => s.channelMounted);

    // Max retries exceeded: channel is mounted but realtime is permanently disconnected
    const isMaxRetriesExceeded =
        channelMounted && realtimeStatus === 'disconnected' && connectionStatus !== 'offline';

    if (connectionStatus === 'connected' && !isMaxRetriesExceeded) return null;

    const isOffline = connectionStatus === 'offline';
    const label = isOffline
        ? 'No internet connection'
        : isMaxRetriesExceeded
            ? 'Live updates disconnected'
            : 'Reconnecting…';

    const bannerColor = isOffline ? colors.textDisabled : colors.warning;

    return (
        <View
            style={[styles.banner, { backgroundColor: bannerColor }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={label}
        >
            <Text style={[typography.caption, styles.text, { color: colors.textInverse }]}>
                {label}
            </Text>

            {isMaxRetriesExceeded && onReconnect && (
                <Pressable
                    onPress={onReconnect}
                    style={[styles.retryButton, { backgroundColor: colors.overlay }]}
                    accessibilityRole="button"
                    accessibilityLabel="Tap to retry connection"
                    hitSlop={8}
                >
                    <Text style={[typography.caption, styles.retryText, { color: colors.textInverse }]}>
                        Tap to retry
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        gap: spacing.md,
    },
    text: {
        fontWeight: '500',
    },
    retryButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radii.xs,
    },
    retryText: {
        fontWeight: '600',
    },
});