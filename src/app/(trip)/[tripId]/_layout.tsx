/**
 * src/app/(trip)/[tripId]/_layout.tsx
 *
 * Stack layout for the individual trip's screens.
 * The trip name is set dynamically by the index screen via navigation.setOptions().
 */
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function TripIdLayout() {
    const isDark = useColorScheme() === 'dark';
    return (
        <Stack screenOptions={{
            headerStyle: { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' },
            headerTintColor: isDark ? '#ffffff' : '#000000',
            headerShadowVisible: false,
            contentStyle: { backgroundColor: isDark ? '#000000' : '#f2f2f7' },
        }}>
            <Stack.Screen name="index" options={{ title: 'Trip', headerBackVisible: false }} />
            <Stack.Screen name="add-expense" options={{ title: 'Add Expense', presentation: 'modal' }} />
            <Stack.Screen name="settle" options={{ title: 'Settle Up' }} />
            <Stack.Screen name="qr" options={{ title: 'Share Trip', presentation: 'modal' }} />
        </Stack>
    );
}