/**
 * app/(trip)/[tripId]/activity.tsx
 *
 * Group-scoped activity timeline.
 * STUB: real implementation in Phase D.10.
 */

import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography, spacing } from '@/theme';

export default function TripActivityScreen() {
    const colors = useThemeColors();
    const { tripId } = useLocalSearchParams<{ tripId: string }>();

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: colors.bg }]}
            edges={['left', 'right', 'bottom']}
        >
            <View style={styles.content}>
                <Text style={[typography.body, { color: colors.textSecondary }]}>
                    Group activity for trip {tripId} — coming in Phase D
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
    },
});