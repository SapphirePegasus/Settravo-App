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
import { useThemeColors } from '@/hooks/useThemeColors';

export default function TripIdLayout() {
    const colors = useThemeColors();

    const headerStyle = {
        backgroundColor: colors.surface,
    } as const;

    return (
        <Stack
            screenOptions={{
                headerStyle,
                headerTintColor: colors.text,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.bg },
            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    title: 'Trip',
                    headerBackVisible: false,
                    headerShown: false,  // trip screen manages its own header
                }}
            />
            <Stack.Screen
                name="add-expense"
                options={{
                    title: 'Add Expense',
                    presentation: 'modal',
                    headerShown: false,
                }}
            />
            <Stack.Screen
                name="settle"
                options={{
                    title: 'Settle Up',
                    headerStyle,
                    headerTintColor: colors.text,
                }}
            />
            <Stack.Screen
                name="qr"
                options={{
                    title: 'Share Trip',
                    presentation: 'modal',
                    headerShown: false,
                }}
            />
            <Stack.Screen
                name="activity"
                options={{
                    title: 'Activity',
                    headerStyle,
                    headerTintColor: colors.text,
                }}
            />
        </Stack>
    );
}