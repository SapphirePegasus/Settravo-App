/**
 * app/(info)/feedback.tsx — Feedback (placeholder)
 *
 * TODO: Wire up a feedback form (e.g. in-app form posting to Supabase,
 * or deep-link to a Typeform / Google Form).
 */

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import { typography, spacing } from '@/theme';

export default function FeedbackScreen() {
    const colors = useThemeColors();
    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
            <View style={styles.center}>
                <Icon name="action.edit" size={48} color={colors.icon} />
                <Text style={[typography.title, { color: colors.text, marginTop: spacing.md }]}>
                    Feedback
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                    We'd love to hear from you. This screen is coming soon.
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