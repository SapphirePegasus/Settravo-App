/**
 * app/(tabs)/groups.tsx
 *
 * Groups tab — flat list of all trips this device has joined.
 * STUB: real implementation in Phase D.3.
 *
 * Currently: renders a placeholder so navigation is fully wired.
 * Replace the inner content in Phase D without touching the route or tab config.
 */

import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { typography, spacing } from '@/theme';

export default function GroupsScreen() {
    const colors = useThemeColors();

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: colors.bg }]}
            edges={['top', 'left', 'right']}
        >
            <View style={styles.header}>
                <Text style={[typography.heading, { color: colors.text }]}>
                    Groups
                </Text>
            </View>
            {/* Phase D.3 content goes here */}
            <View style={styles.placeholder}>
                <Text style={[typography.body, { color: colors.textSecondary }]}>
                    Groups list — coming in Phase D
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: {
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});