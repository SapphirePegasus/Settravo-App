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

/**
 * ConnectionBanner.tsx — with animated entry/exit and minimum display duration.
 *
 * Changes:
 *  - Animated slide-in from top using Animated.Value.
 *  - Minimum visible duration of 1500ms to prevent flicker on brief network
 *    blips (e.g. 4G handoff). The banner won't disappear in under 1.5s once shown.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useColorScheme } from 'react-native';
import { useConnectionStore } from '../stores/connectionStore';

const MIN_VISIBLE_MS = 1500;

export function ConnectionBanner() {
    const status = useConnectionStore((s) => s.connectionStatus);
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';

    const translateY = useRef(new Animated.Value(-60)).current;
    const [visible, setVisible] = useState(false);
    const [displayStatus, setDisplayStatus] = useState(status);
    const minVisibleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shownAt = useRef<number | null>(null);

    useEffect(() => {
        if (status !== 'connected') {
            // Show banner
            setDisplayStatus(status);
            if (!visible) {
                setVisible(true);
                shownAt.current = Date.now();
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 80,
                    friction: 10,
                }).start();
            } else {
                // Update label while already visible
                setDisplayStatus(status);
            }
        } else {
            // Hide banner — respect minimum display duration
            const elapsed = shownAt.current ? Date.now() - shownAt.current : MIN_VISIBLE_MS;
            const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

            if (minVisibleTimer.current) clearTimeout(minVisibleTimer.current);
            minVisibleTimer.current = setTimeout(() => {
                Animated.timing(translateY, {
                    toValue: -60,
                    duration: 250,
                    useNativeDriver: true,
                }).start(() => {
                    setVisible(false);
                    shownAt.current = null;
                });
            }, remaining);
        }

        return () => {
            if (minVisibleTimer.current) clearTimeout(minVisibleTimer.current);
        };
    }, [status, visible, translateY]);

    if (!visible) return null;

    const isOffline = displayStatus === 'offline';

    return (
        <Animated.View
            style={[
                styles.banner,
                { transform: [{ translateY }] },
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
                {isOffline ? '⚡ Offline — changes will sync when reconnected.' : '⟳ Reconnecting…'}
            </Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        alignItems: 'center',
        overflow: 'hidden',
    },
    text: { fontSize: 13, fontWeight: '500' },
    offlineLight: { backgroundColor: '#ffe5e5' },
    offlineDark: { backgroundColor: '#3a0a0a' },
    offlineTextLight: { color: '#a32d2d' },
    offlineTextDark: { color: '#ff8a8a' },
    reconnectingLight: { backgroundColor: '#fff9e6' },
    reconnectingDark: { backgroundColor: '#2a2000' },
    reconnectingTextLight: { color: '#7a5900' },
    reconnectingTextDark: { color: '#ffd966' },
});