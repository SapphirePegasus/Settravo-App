/**
 * app/(info)/help.tsx — Help & Support (placeholder)
 *
 * TODO: Add FAQ accordion, link to support docs, and contact button.
 */

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import { typography, spacing } from '@/theme';

export default function HelpScreen() {
    const colors = useThemeColors();
    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
            <View style={styles.center}>
                <Icon name="status.info" size={48} color={colors.icon} />
                <Text style={[typography.title, { color: colors.text, marginTop: spacing.md }]}>
                    Help & Support
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                    FAQs and support resources are coming soon.
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