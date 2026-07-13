/**
 * app/(info)/feedback.tsx — Feedback (Phase-6: real content)
 *
 * Two paths: report a bug or suggest a feature. Both open the user's mail
 * app via mailto: with a prefilled subject and a diagnostic footer
 * (app version, OS, device model) — the difference between "it's broken"
 * and an actionable report. No in-app form: a form needs a backend endpoint
 * and spam protection; mailto ships value today with zero new surface area.
 *
 * NOTE: SUPPORT_EMAIL must be a real, monitored inbox before release —
 * flagged in PHASE6-NOTES.md.
 */

import Constants from 'expo-constants';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/Toast';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { IconKey } from '../../config/icons';
import { typography, spacing, radii } from '@/theme';

const SUPPORT_EMAIL = 'support@sapphirepegasus.com';

function diagnosticFooter(): string {
    const version = Constants.expoConfig?.version ?? 'unknown';
    return [
        '',
        '',
        '— — — — —',
        'Please keep this so we can help faster:',
        `Settravo v${version}`,
        `${Platform.OS} ${Platform.Version}`,
    ].join('\n');
}

export default function FeedbackScreen() {
    const colors = useThemeColors();
    const { showToast } = useToast();

    const openMail = async (subject: string, intro: string) => {
        const body = encodeURIComponent(intro + diagnosticFooter());
        const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${body}`;
        try {
            await Linking.openURL(url);
        } catch {
            showToast({
                message: `Couldn't open your mail app. Write to ${SUPPORT_EMAIL}`,
                variant: 'error',
            });
        }
    };

    const options: {
        title: string;
        subtitle: string;
        iconKey: IconKey;
        subject: string;
        intro: string;
    }[] = [
        {
            title: 'Report a bug',
            subtitle: 'Something broken or behaving oddly',
            iconKey: 'status.warning',
            subject: 'Settravo — Bug report',
            intro:
                'What happened:\n\n\nWhat I expected:\n\n\nSteps to reproduce:\n1. \n2. \n3. ',
        },
        {
            title: 'Suggest a feature',
            subtitle: 'An idea that would make Settravo better',
            iconKey: 'status.celebration',
            subject: 'Settravo — Feature idea',
            intro: 'My idea:\n\n\nWhy it would help:\n',
        },
        {
            title: 'Anything else',
            subtitle: 'Questions, feedback, or just saying hi',
            iconKey: 'action.send',
            subject: 'Settravo — Feedback',
            intro: '',
        },
    ];

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 19 }]}>
                    Settravo is built by a tiny team and every message is read by a
                    human. Bug reports with steps to reproduce are gold.
                </Text>

                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    {options.map((opt, i) => (
                        <Pressable
                            key={opt.title}
                            onPress={() => openMail(opt.subject, opt.intro)}
                            style={[
                                styles.row,
                                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={opt.title}
                        >
                            <View style={[styles.iconWrap, { backgroundColor: colors.subSurface }]}>
                                <Icon name={opt.iconKey} size={20} color={colors.accent} />
                            </View>
                            <View style={styles.rowText}>
                                <Text style={[typography.bodyMd, { color: colors.text, fontWeight: '600' }]}>
                                    {opt.title}
                                </Text>
                                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                    {opt.subtitle}
                                </Text>
                            </View>
                            <Icon name="header.forward" size={16} color={colors.textDisabled} />
                        </Pressable>
                    ))}
                </View>

                <Text style={[typography.caption, { color: colors.textDisabled, textAlign: 'center', marginTop: spacing.md }]}>
                    Opens your mail app — writes to {SUPPORT_EMAIL}
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { padding: spacing.md, paddingBottom: spacing.xxl },
    card: {
        borderRadius: radii.lg,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowText: { flex: 1 },
});
