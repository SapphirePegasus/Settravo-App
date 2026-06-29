/**
 * ConnectionBanner.tsx
 *
 * Overlay banner showing connection status. Does NOT shift layout —
 * uses absolute positioning to sit on top of content.
 *
 * States:
 *  - offline:      device has no network
 *  - reconnecting: realtime channel dropped, retrying automatically
 *  - disconnected (max retries): shows "Tap to retry" action
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useConnectionStore } from '../stores/connectionStore';

interface Props {
    /** Called when the user taps "Tap to retry" after max reconnect attempts. */
    onReconnect?: () => void;
}

export function ConnectionBanner({ onReconnect }: Props) {
    const connectionStatus = useConnectionStore((s) => s.connectionStatus);
    const realtimeStatus = useConnectionStore((s) => s.realtimeStatus);
    const channelMounted = useConnectionStore((s) => s.channelMounted);

    // Max retries exceeded: channelMounted but realtime is permanently disconnected
    const isMaxRetriesExceeded =
        channelMounted && realtimeStatus === 'disconnected' && connectionStatus !== 'offline';

    if (connectionStatus === 'connected' && !isMaxRetriesExceeded) return null;

    const isOffline = connectionStatus === 'offline';
    const label = isOffline
        ? 'No internet connection'
        : isMaxRetriesExceeded
            ? 'Live updates disconnected'
            : 'Reconnecting…';

    return (
        <View
            style={[styles.banner, isOffline ? styles.offline : styles.reconnecting]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={label}
        >
            <Text style={styles.text}>{label}</Text>
            {isMaxRetriesExceeded && onReconnect && (
                <Pressable
                    onPress={onReconnect}
                    style={styles.retryButton}
                    accessibilityRole="button"
                    accessibilityLabel="Tap to retry connection"
                    hitSlop={8}
                >
                    <Text style={styles.retryText}>Tap to retry</Text>
                </Pressable>
            )}
        </View>
    );
}

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
        paddingVertical: 6,
        paddingHorizontal: 16,
        gap: 12,
    },
    offline: { backgroundColor: '#636366' },
    reconnecting: { backgroundColor: '#ff9f0a' },
    text: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
    },
    retryButton: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderRadius: 6,
    },
    retryText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});