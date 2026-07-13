/**
 * app/(info)/about.tsx — About Settravo (Phase-6: real content)
 *
 * App identity, version/build, what-Settravo-is blurb, and outbound links
 * (website, Play Store listing, privacy policy). Version and native build
 * number are read from expo-constants so this never goes stale.
 */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/Toast';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { IconKey } from '../../config/icons';
import { typography, spacing, radii } from '@/theme';

const PLAY_STORE_URL =
    'https://play.google.com/store/apps/details?id=com.sapphirepegasus.settravo';
const WEBSITE_URL = 'https://www.sapphirepegasus.com';

export default function AboutScreen() {
    const colors = useThemeColors();
    const router = useRouter();
    const { showToast } = useToast();

    const version = Constants.expoConfig?.version ?? '—';
    const build =
        Constants.expoConfig?.android?.versionCode?.toString() ?? null;

    const openUrl = async (url: string) => {
        try {
            await Linking.openURL(url);
        } catch {
            showToast({ message: "Couldn't open the link.", variant: 'error' });
        }
    };

    const rows: { label: string; iconKey: IconKey; onPress: () => void }[] = [
        {
            label: 'Rate us on Google Play',
            iconKey: 'action.share',
            onPress: () => openUrl(PLAY_STORE_URL),
        },
        {
            label: 'Website',
            iconKey: 'status.info',
            onPress: () => openUrl(WEBSITE_URL),
        },
        {
            label: 'Privacy Policy',
            iconKey: 'action.copy',
            onPress: () => router.push('/(info)/privacy'),
        },
    ];

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* ── Identity ─────────────────────────────────────────── */}
                <View style={styles.identity}>
                    <View style={[styles.logoBadge, { backgroundColor: colors.accent }]}>
                        <Icon name="money.settle" size={34} color={colors.textInverse} />
                    </View>
                    <Text style={[typography.heading, { color: colors.text, marginTop: spacing.md }]}>
                        Settravo
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        Version {version}{build ? ` (build ${build})` : ''}
                    </Text>
                </View>

                {/* ── What it is ───────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Text style={[typography.body, { color: colors.text, lineHeight: 22 }]}>
                        Settravo splits trip and household expenses without the
                        awkwardness. Add what you spent, see exactly who owes whom,
                        settle up with one tap — and share a private link so even
                        friends without the app can see their balance. It works
                        offline and syncs when you're back.
                    </Text>
                    <Text style={[typography.caption, { color: colors.textDisabled, marginTop: spacing.md }]}>
                        Split expenses, not friendships.
                    </Text>
                </View>

                {/* ── Links ────────────────────────────────────────────── */}
                <View style={[styles.card, styles.linksCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    {rows.map((row, i) => (
                        <Pressable
                            key={row.label}
                            onPress={row.onPress}
                            style={[
                                styles.linkRow,
                                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={row.label}
                        >
                            <Icon name={row.iconKey} size={18} color={colors.accent} />
                            <Text style={[typography.bodyMd, { color: colors.text, flex: 1 }]}>
                                {row.label}
                            </Text>
                            <Icon name="header.forward" size={16} color={colors.textDisabled} />
                        </Pressable>
                    ))}
                </View>

                <Text style={[typography.caption, { color: colors.textDisabled, textAlign: 'center', marginTop: spacing.lg }]}>
                    © {new Date().getFullYear()} Sapphire Pegasus{'\n'}
                    Made with care in India 🇮🇳
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { padding: spacing.md, paddingBottom: spacing.xxl },
    identity: { alignItems: 'center', paddingVertical: spacing.lg },
    logoBadge: {
        width: 72,
        height: 72,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        borderRadius: radii.lg,
        borderWidth: 1,
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    linksCard: { paddingVertical: 0, paddingHorizontal: spacing.md },
    linkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
    },
});