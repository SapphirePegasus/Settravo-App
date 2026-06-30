/**
 * app/_layout.tsx
 *
 * Root layout. Single responsibilities:
 *  1. Sentry initialised at module load (before any component renders).
 *  2. Wraps the tree: GestureHandler → SafeArea → ToastProvider → AppErrorBoundary → ThemeProvider.
 *  3. Boots identity (initializeIdentity) and waits for isReady.
 *  4. Subscribes to auth changes + NetInfo (single subscriber each).
 *  5. Mounts useOfflineSync() once — never in individual screens.
 *  6. Auth gate: no user → redirect to (auth)/onboarding.
 *  7. ThemeProvider is inside the tree so all screens have access.
 *
 * Removed from here (Phase B):
 *  - OnboardingScreen component: moved to app/(auth)/onboarding.tsx
 *  - useColorScheme() / isDark: all theming now from ThemeProvider
 *  - Hardcoded hex color strings
 */

import * as Sentry from '@sentry/react-native';
import NetInfo from '@react-native-community/netinfo';
import { Redirect, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { ToastProvider } from '../components/Toast';
import { ThemeProvider, useThemeContext } from '@/context/ThemeContext';
import { useOfflineSync } from '../hooks/useOfflineSync';
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
    const isReady = useAuthStore((s) => s.isReady);
    const deviceUser = useAuthStore((s) => s.deviceUser);
    const initError = useAuthStore((s) => s.initError);
    const setNetworkOnline = useConnectionStore((s) => s.setNetworkOnline);

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

    // ── Offline queue — mounted once at root ──────────────────────────────────
    // Any additional mount (e.g. in a trip screen) creates a race condition
    // where multiple instances replay the same queue items concurrently.
    useOfflineSync();

    // ── Splash screen gate ────────────────────────────────────────────────────
    const hideSplash = useCallback(async () => {
        if (isReady) await SplashScreen.hideAsync();
    }, [isReady]);

    useEffect(() => { hideSplash(); }, [hideSplash]);

    // ── Loading state ─────────────────────────────────────────────────────────
    if (!isReady) {
        return (
            <View style={[styles.center, { backgroundColor: colors.bg }]}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    // ── Init error ────────────────────────────────────────────────────────────
    if (initError) {
        return (
            <View style={[styles.center, { backgroundColor: colors.bg }]}>
                <Text style={[styles.errorHeading, { color: colors.text }]}>
                    Unable to start
                </Text>
                <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>
                    Check your connection and restart the app.
                </Text>
                <Text style={[styles.errorDetail, { color: colors.textDisabled }]}>
                    {initError}
                </Text>
            </View>
        );
    }

    // ── Auth gate ─────────────────────────────────────────────────────────────
    // No user at all → onboarding.
    // User with no display name → onboarding (name entry step).
    if (!deviceUser || deviceUser.displayName === null) {
        return <Redirect href="/(auth)/onboarding" />;
    }

    // ── Main navigation ───────────────────────────────────────────────────────
    // Do NOT manually declare <Stack.Screen name="(auth)" /> etc. here.
    // Expo Router auto-registers route groups from the filesystem. Manually
    // re-declaring them alongside the conditional <Redirect> above caused the
    // navigator's internal screen list to change every render, which
    // destabilized @react-navigation's useSyncState and produced:
    //   "Maximum update depth exceeded" — infinite re-render loop.
    // An empty <Stack> with only screenOptions is the correct, stable pattern.
    return (
        <>
            <StatusBar style={colors.statusBarStyle} />
            <Stack screenOptions={{ headerShown: false }} />
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
});
