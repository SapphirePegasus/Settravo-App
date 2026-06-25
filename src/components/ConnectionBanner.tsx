/**
 * ConnectionBanner.tsx
 *
 * Displays a non-intrusive banner at the top of any screen when the
 * connection is degraded. Invisible when fully connected.
 *
 * Connected by default → banner is hidden.
 * Offline or reconnecting → banner slides in with a warning.
 *
 * This reads from connectionStore which is populated by:
 *  - NetInfo listener in the root layout (networkOnline)
 *  - realtimeService (realtimeStatus) — wired up in Phase 3
 */

import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useConnectionStore } from '../stores/connectionStore';

export function ConnectionBanner() {
    const status = useConnectionStore((s) => s.connectionStatus);
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';

    if (status === 'connected') {
        return null;
    }

    const isOffline = status === 'offline';

    return (
        <View
            style={[
                styles.banner,
                isOffline
                    ? isDark ? styles.offlineDark : styles.offlineLight
                    : isDark ? styles.reconnectingDark : styles.reconnectingLight,
            ]}
        >
            <Text
                style={[
                    styles.text,
                    isOffline
                        ? isDark ? styles.offlineTextDark : styles.offlineTextLight
                        : isDark ? styles.reconnectingTextDark : styles.reconnectingTextLight,
                ]}
            >
                {isOffline
                    ? 'You are offline. Changes will sync when reconnected.'
                    : 'Reconnecting…'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    text: {
        fontSize: 13,
        fontWeight: '500',
    },
    offlineLight: { backgroundColor: '#ffe5e5' },
    offlineDark: { backgroundColor: '#3a0a0a' },
    offlineTextLight: { color: '#a32d2d' },
    offlineTextDark: { color: '#ff8a8a' },
    reconnectingLight: { backgroundColor: '#fff3cd' },
    reconnectingDark: { backgroundColor: '#3a2a00' },
    reconnectingTextLight: { color: '#856404' },
    reconnectingTextDark: { color: '#ffd966' },
});