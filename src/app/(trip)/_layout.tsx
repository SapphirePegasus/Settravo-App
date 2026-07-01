/**
 * src/app/(trip)/_layout.tsx
 *
 * Layout for the (trip) route group.
 * FIXED: was using useColorScheme() + hardcoded hex strings.
 *        Now uses useThemeColors() — fully token-driven.
 */

import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function TripGroupLayout() {
    const colors = useThemeColors();

    const contentStyle = useMemo(
        () => ({ backgroundColor: colors.bg }) as const,
        [colors.bg],
    );

    const screenOptions = useMemo(
        () => ({
            headerShown: false,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle,
        }),
        [colors.surface, colors.text, contentStyle],
    );

    return <Stack screenOptions={screenOptions} />;
}