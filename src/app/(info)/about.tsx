/**
 * app/(info)/about.tsx — About Settravo (placeholder)
 *
 * TODO: Add app version, credits, legal links (Privacy Policy, Terms of Service).
 */

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Icon } from '../../components/ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import { typography, spacing } from '@/theme';

export default function AboutScreen() {
    const colors = useThemeColors();
    const version = Constants.expoConfig?.version ?? '—';

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
            <View style={styles.center}>
                <Icon name="status.info" size={48} color={colors.accent} />
                <Text style={[typography.title, { color: colors.text, marginTop: spacing.md }]}>
                    Settravo
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                    Version {version}
                </Text>
                <Text style={[typography.caption, { color: colors.textDisabled, textAlign: 'center', marginTop: spacing.lg }]}>
                    Split expenses, not friendships.{'\n'}Built with care for travellers everywhere.
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
});