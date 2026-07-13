/**
 * app/(info)/privacy.tsx — Privacy Policy (Phase-6: real content)
 *
 * Written to be TRUE for the app as it ships today: anonymous accounts,
 * trip data in Supabase, Sentry crash reporting, guest links, no ads, no
 * analytics profiling, no data sale. When ads land (later phase) the
 * "Advertising" section MUST be updated before release — flagged in notes.
 *
 * This text is a solid, honest baseline — it is not legal advice; have it
 * reviewed before wide release (also flagged in notes). The same policy
 * must be published at a public URL for the Play Store listing.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemeColors } from '../../hooks/useThemeColors';
import { typography, spacing, radii } from '@/theme';

const LAST_UPDATED = '15 July 2026';
const CONTACT_EMAIL = 'support@sapphirepegasus.com';

interface Section {
    title: string;
    body: string;
}

const SECTIONS: Section[] = [
    {
        title: 'The short version',
        body: 'Settravo stores the expense data you enter so you and your trip-mates can split bills. Accounts are anonymous — no name, email, or phone number is required. We don\u2019t sell data, we don\u2019t profile you for advertising, and only the members of a trip can see that trip.',
    },
    {
        title: 'What we collect',
        body: 'An anonymous account ID created on first launch (no email or phone). The display name you choose. The trips, members, expenses, splits, recurring bills, and settlements you create. Optional trip cover photos you upload. Crash and error reports (via Sentry) containing technical details like device model, OS version, and what the app was doing when it failed \u2014 never your expense amounts or names in message bodies we control.',
    },
    {
        title: 'What we deliberately don\u2019t collect',
        body: 'No contacts access. No location tracking. No advertising identifiers or behavioural profiling. No selling or renting of any data to anyone, ever.',
    },
    {
        title: 'Where your data lives',
        body: 'Trip data is stored with Supabase (our database provider) and protected by row-level security: the server itself enforces that only members of a trip can read or change it. A copy of your trips is also cached on your device so the app works offline; it\u2019s removed if you sign out.',
    },
    {
        title: 'Guest links',
        body: 'When you add a friend by name, Settravo creates a private link containing a long random token. Anyone with that exact link can see that one person\u2019s balance for that one trip \u2014 nothing else. Treat it like you\u2019d treat the balance itself: share it only with that person. Links stop working if the guest joins the app and claims their spot.',
    },
    {
        title: 'How long we keep things',
        body: 'Your data stays as long as your trips exist. Deleting an expense or trip removes it for everyone in it. Leaving a trip removes it from your device.',
    },
    {
        title: 'Deleting everything',
        body: 'Email us from the Feedback screen and we\u2019ll erase your account\u2019s data from our servers. Because accounts are anonymous, include the display name and trip names involved so we can locate the right records.',
    },
    {
        title: 'Children',
        body: 'Settravo is not directed at children under 13, and we don\u2019t knowingly collect data from them.',
    },
    {
        title: 'Changes to this policy',
        body: 'If we add features that change what\u2019s collected (for example, advertising in the free tier), this policy will be updated first and the \u201cLast updated\u201d date will change.',
    },
    {
        title: 'Contact',
        body: `Questions or requests: ${CONTACT_EMAIL}. Operated by Sapphire Pegasus, India.`,
    },
];

export default function PrivacyScreen() {
    const colors = useThemeColors();

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                    Last updated: {LAST_UPDATED}
                </Text>

                {SECTIONS.map((section) => (
                    <View
                        key={section.title}
                        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                    >
                        <Text style={[typography.bodyMd, { color: colors.text, fontWeight: '600', marginBottom: spacing.xs }]}>
                            {section.title}
                        </Text>
                        <Text style={[typography.body, { color: colors.textSecondary, lineHeight: 21 }]}>
                            {section.body}
                        </Text>
                    </View>
                ))}
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
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
});