/**
 * src/app/(trip)/_layout.tsx
 *
 * Layout for the (trip) route group. Uses a Stack navigator so screens
 * within the trip flow share back-navigation and header chrome.
 *
 * Route group parentheses mean "(trip)" does NOT appear in the URL path:
 *   app/(trip)/join.tsx     → /join
 *   app/(trip)/[tripId]/    → /[tripId]
 */

import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function TripGroupLayout() {
    const isDark = useColorScheme() === 'dark';

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                headerStyle: {
                    backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',
                },
                headerTintColor: isDark ? '#ffffff' : '#000000',
                headerShadowVisible: false,
                contentStyle: {
                    backgroundColor: isDark ? '#000000' : '#f2f2f7',
                },
            }}
        />
    );
}