/**
 * src/app/_layout.tsx
 *
 * Root layout for Expo Router. This file:
 *  1. Runs initializeIdentity() on mount — must complete before any screen renders.
 *  2. Subscribes to Supabase auth state changes (single subscriber, never duplicated).
 *  3. Subscribes to NetInfo for offline queue trigger.
 *  4. Renders a SplashScreen-style loading state while auth initializes.
 *  5. Renders an error state if auth fails permanently.
 *  6. Respects the system color scheme (light/dark) via useColorScheme().
 *  7. Uses the system font — no custom font loading, no extra dependency.
 *
 * Auth guard pattern:
 *  - isReady=false → show loading indicator (SplashScreen is still visible)
 *  - isReady=true, deviceUser=null → show onboarding (name entry)
 *  - isReady=true, deviceUser set, displayName=null → show name prompt
 *  - isReady=true, deviceUser set, displayName set → render <Stack />
 *
 * This is the ONLY place that calls initializeIdentity() and subscribes
 * to auth changes. Never do this in a screen component.
 */

import NetInfo from '@react-native-community/netinfo';
import { SplashScreen, Stack } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { subscribeToAuthChanges, useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';

// Keep the splash screen visible while auth initializes.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme(); // 'light' | 'dark' | null
  const isDark = scheme === 'dark';

  const initializeIdentity = useAuthStore((s) => s.initializeIdentity);
  const isReady = useAuthStore((s) => s.isReady);
  const deviceUser = useAuthStore((s) => s.deviceUser);
  const initError = useAuthStore((s) => s.initError);

  const setNetworkOnline = useConnectionStore((s) => s.setNetworkOnline);

  // ── Initialize identity on mount ──────────────────────────────────────────
  useEffect(() => {
    initializeIdentity();
  }, [initializeIdentity]);

  // ── Subscribe to Supabase auth state changes ──────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges();
    return unsubscribe;
  }, []);

  // ── Subscribe to network state ─────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkOnline(state.isConnected ?? false);
    });
    return () => {
      unsubscribe();
    };
  }, [setNetworkOnline]);

  // ── Hide splash once auth is ready ────────────────────────────────────────
  const onReady = useCallback(async () => {
    if (isReady) {
      await SplashScreen.hideAsync();
    }
  }, [isReady]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (!isReady) {
    // Splash screen is still showing — render nothing (or a transparent fill
    // so the splash doesn't flash before hide).
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

  // Name prompt: deviceUser exists (auth done) but no display name yet.
  // Show a blocking name-entry screen before the main stack.
  if (deviceUser && deviceUser.displayName === null) {
    return <OnboardingScreen isDark={isDark} />;
  }

  // ── Main navigation stack ─────────────────────────────────────────────────
  return (
    <Stack
      screenOptions={{
        // Use system font weight and size — no custom font loading.
        headerStyle: {
          backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',
        },
        headerTintColor: isDark ? '#ffffff' : '#000000',
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: isDark ? '#000000' : '#f2f2f7',
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen
        name="(trip)"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lightBg: { backgroundColor: '#f2f2f7' },
  darkBg: { backgroundColor: '#000000' },
  lightText: { color: '#000000' },
  darkText: { color: '#ffffff' },
  lightSubText: { color: '#6c6c70' },
  darkSubText: { color: '#8e8e93' },
  errorText: {
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 13,
    textAlign: 'center',
  },
});