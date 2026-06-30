/**
 * app/(trip)/[tripId]/_layout.tsx
 *
 * Stack layout for an individual trip's screens.
 * Trip name is set dynamically by index.tsx via navigation.setOptions().
 *
 * REFACTOR: removed useColorScheme() + hardcoded hex strings.
 * All header colors from useThemeColors().
 */

import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function TripIdLayout() {
    const colors = useThemeColors();

    const headerStyle = useMemo(
        () => ({ backgroundColor: colors.surface }) as const,
        [colors.surface],
    );

    const screenOptions = useMemo(
        () => ({
            headerStyle,
            headerShown: false,
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
        }),
        [headerStyle, colors.text, colors.bg],
    );

    const indexOptions = useMemo(
        () => ({ title: 'Trip', headerBackVisible: false, headerShown: false }),
        [],
    );
    const addExpenseOptions = useMemo(
        () => ({ title: 'Add Expense', presentation: 'modal' as const, headerShown: false }),
        [],
    );
    const settleOptions = useMemo(
        () => ({ title: 'Settle Up', headerStyle, headerTintColor: colors.text }),
        [headerStyle, colors.text],
    );
    const qrOptions = useMemo(
        () => ({ title: 'Share Trip', presentation: 'modal' as const, headerShown: false }),
        [],
    );
    const activityOptions = useMemo(
        () => ({ title: 'Activity', headerStyle, headerTintColor: colors.text }),
        [headerStyle, colors.text],
    );

    return (
        <Stack screenOptions={screenOptions}>
            <Stack.Screen name="index" options={indexOptions} />
            <Stack.Screen name="add-expense" options={addExpenseOptions} />
            <Stack.Screen name="settle" options={settleOptions} />
            <Stack.Screen name="qr" options={qrOptions} />
            <Stack.Screen name="activity" options={activityOptions} />
        </Stack>
    );
}