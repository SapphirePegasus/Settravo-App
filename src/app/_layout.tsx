/**
 * app/_layout.tsx
 *
 * Root layout. Single responsibilities:
 *  1. Sentry initialised at module load (before any component renders).
 *  2. Local cache (SQLite) initialised at module load — hooks hydrate from it.
 *  3. Wraps the tree: GestureHandler → SafeArea → ToastProvider → AppErrorBoundary → ThemeProvider.
 *  4. Boots identity (initializeIdentity) and waits for isReady.
 *  5. Subscribes to auth changes + NetInfo (single subscriber each).
 *  6. Mounts useOfflineSync() + SyncStatusBanner once — never in screens.
 *  7. Auth gate: Stack.Protected declarative guards (SDK 53+ pattern).
 *
 * Phase-3 boot UX:
 *  - initializeIdentity now only fails on TRUE first launch offline
 *    (authService guarantees a session never throws). That case gets a
 *    friendly explainer with a Retry button, and retries automatically the
 *    moment connectivity returns.
 *  - Provisional users (offline boot, uncached profile) pass the auth gate —
 *    they are onboarded; their profile refreshes in the background.
 */

import * as Sentry from '@sentry/react-native';
import NetInfo from '@react-native-community/netinfo';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { SyncStatusBanner } from '../components/SyncStatusBanner';
import { ToastProvider } from '../components/Toast';
import { ThemeProvider, useThemeContext } from '@/context/ThemeContext';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { initLocalCache } from '../lib/localCache';
import { subscribeToAuthChanges, useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';

// ─── Sentry ───────────────────────────────────────────────────────────────────
// Must run at module scope — instruments the first frame.
// DSN is safe in the bundle: accepts inbound events only, no data reads.

Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: __DEV__ ? 0 : 0.2,
    enableNativeNagger: false,
    enableAutoPerformanceTracing: !__DEV__,
});

// ─── Local cache ──────────────────────────────────────────────────────────────
// Module scope: synchronous, must be ready before any hook hydrates from it.

initLocalCache();

SplashScreen.preventAutoHideAsync();

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={styles.flex}>
            <SafeAreaProvider>
                <ToastProvider>
                    <AppErrorBoundary>
                        <ThemeProvider>
                            <RootLayoutInner />
                        </ThemeProvider>
                    </AppErrorBoundary>
                </ToastProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

// ─── Inner layout (needs ThemeContext) ───────────────────────────────────────

function RootLayoutInner() {
    const { colors } = useThemeContext();

    const initializeIdentity = useAuthStore((s) => s.initializeIdentity);
    const retryInitialize = useAuthStore((s) => s.retryInitialize);
    const isReady = useAuthStore((s) => s.isReady);
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const initError = useAuthStore((s) => s.initError);
    const initErrorCode = useAuthStore((s) => s.initErrorCode);
    const setNetworkOnline = useConnectionStore((s) => s.setNetworkOnline);
    const networkOnline = useConnectionStore((s) => s.networkOnline);

    // ── Identity boot ─────────────────────────────────────────────────────────
    useEffect(() => {
        initializeIdentity();
    }, [initializeIdentity]);

    // ── Auth state subscription (single instance) ────────────────────────────
    useEffect(() => {
        const unsubscribe = subscribeToAuthChanges();
        return unsubscribe;
    }, []);

    // ── Network listener ──────────────────────────────────────────────────────
    // Fetch real initial state immediately — the first listener event fires
    // asynchronously and would leave a stale gap on first render.
    useEffect(() => {
        NetInfo.fetch().then((state) => {
            setNetworkOnline(state.isConnected ?? false);
        });
        const unsubscribe = NetInfo.addEventListener((state) => {
            setNetworkOnline(state.isConnected ?? false);
        });
        return () => { unsubscribe(); };
    }, [setNetworkOnline]);

    // ── Auto-retry a failed first-launch boot when connectivity returns ──────
    useEffect(() => {
        if (initError && networkOnline) {
            retryInitialize();
        }
    }, [initError, networkOnline, retryInitialize]);

    // ── Offline queue — mounted once at root ──────────────────────────────────
    useOfflineSync();

    // ── Splash screen gate ────────────────────────────────────────────────────
    const hideSplash = useCallback(async () => {
        if (isReady) await SplashScreen.hideAsync();
    }, [isReady]);

    useEffect(() => { hideSplash(); }, [hideSplash]);

    // Rules of Hooks: declared unconditionally, before any early return.
    const rootScreenOptions = useMemo(() => ({ headerShown: false }), []);

    // ── Loading state ─────────────────────────────────────────────────────────
    if (!isReady) {
        return (
            <View style={[styles.center, { backgroundColor: colors.bg }]}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    // ── Init error ────────────────────────────────────────────────────────────
    // Reachable only on TRUE first launch without internet (authService
    // guarantees any existing session boots successfully).
    if (initError) {
        const isFirstLaunchOffline = initErrorCode === 'NETWORK';
        return (
            <View style={[styles.center, { backgroundColor: colors.bg }]}>
                <Text style={[styles.errorHeading, { color: colors.text }]}>
                    {isFirstLaunchOffline ? 'Connect to get started' : 'Unable to start'}
                </Text>
                <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>
                    {isFirstLaunchOffline
                        ? 'Settravo needs internet the first time you open it, to set up your device. After that it works offline too.'
                        : 'Something went wrong while starting the app.'}
                </Text>
                {!isFirstLaunchOffline && (
                    <Text style={[styles.errorDetail, { color: colors.textDisabled }]}>
                        {initError}
                    </Text>
                )}
                <Pressable
                    onPress={retryInitialize}
                    style={[styles.retryBtn, { backgroundColor: colors.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel="Retry"
                >
                    <Text style={[styles.retryLabel, { color: colors.textInverse }]}>
                        Try again
                    </Text>
                </Pressable>
                {isFirstLaunchOffline && (
                    <Text style={[styles.errorDetail, { color: colors.textDisabled }]}>
                        We'll also retry automatically when you're back online.
                    </Text>
                )}
            </View>
        );
    }

    // ── Main navigation ───────────────────────────────────────────────────────
    // Stack.Protected declarative guards (stable SDK 53+ auth pattern — see
    // docs.expo.dev/router/advanced/authentication). Provisional users pass:
    // they hold a session and are onboarded; the profile arrives when online.
    const isAuthenticated =
        !!deviceUser && (deviceUser.displayName !== null || deviceUser.isProvisional === true);

    return (
        <>
            <StatusBar style={colors.statusBarStyle} />
            <Stack screenOptions={rootScreenOptions}>
                <Stack.Protected guard={isAuthenticated}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="(trip)" />
                    <Stack.Screen name="(info)" options={{ presentation: 'modal', headerShown: false }} />
                </Stack.Protected>
                <Stack.Protected guard={!isAuthenticated}>
                    <Stack.Screen name="(auth)" />
                </Stack.Protected>
            </Stack>
            {/* Floats above all screens; renders null when there's nothing to say */}
            <SyncStatusBanner />
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    flex: { flex: 1 },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    errorHeading: {
        fontSize: 17,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 8,
    },
    errorDetail: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 4,
    },
    retryBtn: {
        marginTop: 20,
        paddingHorizontal: 32,
        height: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    retryLabel: {
        fontSize: 15,
        fontWeight: '600',
    },
});