/**
 * app/(auth)/_layout.tsx
 *
 * Layout for the (auth) route group.
 * Renders a simple Stack with no visible header and no tab bar.
 * Only screen: onboarding.tsx
 *
 * The "(auth)" prefix is a route group — it does NOT appear in URLs.
 * onboarding.tsx → accessible at /onboarding
 */

import { Stack } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function AuthGroupLayout() {
    const colors = useThemeColors();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
            }}
        />
    );
}