/**
 * app/(info)/help.tsx — Help & FAQ (Phase-6: real content)
 *
 * Expandable FAQ covering every real support question the app's mechanics
 * create: join codes and their 30-minute expiry, guest members and links,
 * how settle math works (pairwise + undo), offline behaviour and the sync
 * banner, recurring bills, and editing/deleting expenses.
 *
 * Simple controlled accordion — no LayoutAnimation (deprecated-adjacent on
 * New Architecture) and no extra dependency; expand/collapse is instant.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../../components/ui/Icon';
import { useThemeColors } from '../../hooks/useThemeColors';
import { typography, spacing, radii } from '@/theme';

interface FaqItem {
    q: string;
    a: string;
}

const FAQ: FaqItem[] = [
    {
        q: 'How do I add friends to a trip?',
        a: 'Open the trip → Members → share the 4-character join code or the QR. Codes expire after 30 minutes for safety — regenerate a fresh one anytime from the same screen. You can also add someone by name as a guest; they get a private web link showing their balance, no app needed.',
    },
    {
        q: "What's a guest member?",
        a: "A guest is someone you added by name who hasn't installed Settravo. They count in splits like everyone else, and their private link always shows their live balance. If they later join the trip in the app using the same name, they automatically claim their history.",
    },
    {
        q: 'How does Settle Up decide who pays whom?',
        a: "Settravo only ever shows real debts between two people: your unsettled shares of what they paid, minus theirs of what you paid. Nothing is shuffled through third people, so every card is a payment you can actually make. \"Mark as Paid\" clears everything between the two of you, and there's an Undo on the Settled tab if you tap by mistake.",
    },
    {
        q: 'Does the app work offline?',
        a: "Yes. Your trips, expenses, and balances are stored on the device, so everything is readable offline. Expenses you add and settlements you mark while offline are queued and sync automatically when you're back online — the banner at the bottom shows anything pending, syncing, or failed.",
    },
    {
        q: 'A change failed to sync — what now?',
        a: 'Tap the red banner to see exactly which changes failed and why. You can retry each one or discard it. Nothing is ever silently dropped.',
    },
    {
        q: 'How do recurring bills work?',
        a: "In a group, open Recurring Bills from the menu and set up e.g. \"Rent, monthly on the 1st\". The bill is created automatically each period when anyone opens the group, split equally among the current members. Pause or delete it anytime — past bills always stay in your history.",
    },
    {
        q: 'Can I edit or delete an expense?',
        a: 'Tap the expense → edit or delete. Anyone in the trip can fix expenses paid by a guest; expenses you paid are yours to manage. Deleting removes its splits too, and balances recalculate instantly for everyone.',
    },
    {
        q: 'Why does my join code keep expiring?',
        a: "By design: a code is a door into your trip's finances, so it only stays valid for 30 minutes. Regenerating is one tap and invalidates the old one.",
    },
    {
        q: 'Is my data private?',
        a: 'Trips are visible only to their members. Guest links show that one person only their own balance. We have no ads-based profiling and never sell data. See the Privacy Policy for the full picture.',
    },
];

export default function HelpScreen() {
    const colors = useThemeColors();
    const router = useRouter();
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                    Quick answers to the most common questions.
                </Text>

                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    {FAQ.map((item, i) => {
                        const open = openIndex === i;
                        return (
                            <View
                                key={item.q}
                                style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }}
                            >
                                <Pressable
                                    onPress={() => setOpenIndex(open ? null : i)}
                                    style={styles.qRow}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: open }}
                                    accessibilityLabel={item.q}
                                >
                                    <Text style={[typography.bodyMd, { color: colors.text, flex: 1, fontWeight: '600' }]}>
                                        {item.q}
                                    </Text>
                                    <Icon
                                        name={open ? 'header.close' : 'header.forward'}
                                        size={16}
                                        color={colors.textDisabled}
                                    />
                                </Pressable>
                                {open && (
                                    <Text style={[typography.body, styles.answer, { color: colors.textSecondary }]}>
                                        {item.a}
                                    </Text>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* Still stuck → feedback */}
                <Pressable
                    onPress={() => router.push('/(info)/feedback')}
                    style={[styles.stuckCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                    accessibilityRole="button"
                    accessibilityLabel="Contact us"
                >
                    <Icon name="action.send" size={20} color={colors.accent} />
                    <View style={styles.stuckText}>
                        <Text style={[typography.bodyMd, { color: colors.text, fontWeight: '600' }]}>
                            Still stuck?
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            Send us a message — we read everything.
                        </Text>
                    </View>
                    <Icon name="header.forward" size={16} color={colors.textDisabled} />
                </Pressable>
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
        marginBottom: spacing.md,
    },
    qRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
    },
    answer: {
        lineHeight: 21,
        paddingBottom: spacing.md,
        paddingRight: spacing.lg,
    },
    stuckCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 1,
        padding: spacing.md,
    },
    stuckText: { flex: 1 },
});