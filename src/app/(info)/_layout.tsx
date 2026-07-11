/**
 * app/(info)/_layout.tsx
 *
 * Stack layout for informational screens reachable from the side-drawer menu:
 *   - Feedback
 *   - Help
 *   - About
 *
 * These screens are presented as a modal stack so the user can dismiss back
 * to wherever they were in the main app flow.
 */

import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function InfoLayout() {
    const colors = useThemeColors();

    const headerStyle = useMemo(
        () => ({ backgroundColor: colors.surface }) as const,
        [colors.surface],
    );

    const screenOptions = useMemo(
        () => ({
            headerStyle,
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
        }),
        [headerStyle, colors.text, colors.bg],
    );

    return (
        <Stack screenOptions={screenOptions}>
            <Stack.Screen name="feedback" options={{ title: 'Feedback' }} />
            <Stack.Screen name="help" options={{ title: 'Help' }} />
            <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
            <Stack.Screen name="about" options={{ title: 'About' }} />
        </Stack>
    );
}