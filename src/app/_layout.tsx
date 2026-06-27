/**
 * src/app/_layout.tsx
 *
 * Root layout. Responsibilities:
 *  1. Sentry crash reporting initialised at module load time.
 *  2. Runs initializeIdentity() — must complete before any screen renders.
 *  3. Subscribes to Supabase auth state changes (single subscriber).
 *  4. Subscribes to NetInfo for offline queue trigger.
 *  5. Mounts useOfflineSync() ONCE — never in individual trip screens.
 *  6. Wraps all children in AppErrorBoundary for render-error recovery.
 *  7. Respects system color scheme (light/dark).
 */

import * as Sentry from '@sentry/react-native';
import NetInfo from '@react-native-community/netinfo';
import { SplashScreen, Stack } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { subscribeToAuthChanges, useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';

// ─── Sentry initialisation ────────────────────────────────────────────────────
// Must run before any component renders so the first frame is already instrumented.
// DSN is safe to ship in the bundle — it only accepts inbound events, not reads.
Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    environment: __DEV__ ? 'development' : 'production',
    // 20% of sessions emit performance traces — adjust as traffic grows
    tracesSampleRate: __DEV__ ? 0 : 0.2,
    // Disable native nagger dialog — errors surface in the Sentry dashboard
    enableNativeNagger: false,
    // Breadcrumbs for console.warn/error aid debugging without PII leakage
    enableAutoPerformanceTracing: !__DEV__,
});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';

    const initializeIdentity = useAuthStore((s) => s.initializeIdentity);
    const isReady = useAuthStore((s) => s.isReady);
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const initError = useAuthStore((s) => s.initError);
    const setNetworkOnline = useConnectionStore((s) => s.setNetworkOnline);

    // ── Identity ─────────────────────────────────────────────────────────────
    useEffect(() => {
        initializeIdentity();
    }, [initializeIdentity]);

    // ── Auth changes ──────────────────────────────────────────────────────────
    useEffect(() => {
        const unsubscribe = subscribeToAuthChanges();
        return unsubscribe;
    }, []);

    // ── Network state ─────────────────────────────────────────────────────────
    useEffect(() => {
        // Fetch real initial state immediately — the first listener event fires
        // asynchronously and would leave a stale gap on first render.
        NetInfo.fetch().then((state) => {
            setNetworkOnline(state.isConnected ?? false);
        });

        const unsubscribe = NetInfo.addEventListener((state) => {
            setNetworkOnline(state.isConnected ?? false);
        });
        return () => { unsubscribe(); };
    }, [setNetworkOnline]);

    // ── Offline queue sync — mounted ONCE at root ─────────────────────────────
    // Never call useOfflineSync() inside individual trip screens — that creates
    // multiple racing instances sharing the same global queue.
    useOfflineSync();

    // ── Splash screen ─────────────────────────────────────────────────────────
    const onReady = useCallback(async () => {
        if (isReady) {
            await SplashScreen.hideAsync();
        }
    }, [isReady]);

    useEffect(() => { onReady(); }, [onReady]);

    // ── Loading / error / onboarding gates ───────────────────────────────────
    if (!isReady) {
        return (
            <View style={[styles.center, isDark ? styles.darkBg : styles.lightBg]}>
                <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
            </View>
        );
    }

    if (initError) {
        return (
            <View style={[styles.center, isDark ? styles.darkBg : styles.lightBg]}>
                <Text style={[styles.errorText, isDark ? styles.darkText : styles.lightText]}>
                    Unable to start. Please check your connection and restart the app.
                </Text>
                <Text style={[styles.errorDetail, isDark ? styles.darkSubText : styles.lightSubText]}>
                    {initError}
                </Text>
            </View>
        );
    }

    if (deviceUser && deviceUser.displayName === null) {
        return <OnboardingScreen isDark={isDark} />;
    }

    return (
        <AppErrorBoundary>
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' },
                    headerTintColor: isDark ? '#ffffff' : '#000000',
                    headerShadowVisible: false,
                    contentStyle: { backgroundColor: isDark ? '#000000' : '#f2f2f7' },
                }}
            >
                <Stack.Screen name="index" options={{ title: '' }} />
                <Stack.Screen name="(trip)" options={{ headerShown: false }} />
            </Stack>
        </AppErrorBoundary>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    lightBg: { backgroundColor: '#f2f2f7' },
    darkBg: { backgroundColor: '#000000' },
    lightText: { color: '#000000' },
    darkText: { color: '#ffffff' },
    lightSubText: { color: '#6c6c70' },
    darkSubText: { color: '#8e8e93' },
    errorText: { fontSize: 17, fontWeight: '500', textAlign: 'center', marginBottom: 8 },
    errorDetail: { fontSize: 13, textAlign: 'center' },
});