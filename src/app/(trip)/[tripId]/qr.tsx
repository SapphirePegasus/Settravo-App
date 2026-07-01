/**
 * app/(trip)/[tripId]/qr.tsx — QR Code + Share screen
 *
 * All emoji replaced:
 *   ⏱ expired icon → <Icon name="status.syncing" /> (clock/hourglass)
 *   🔄 New Code → <Icon name="action.refresh" />
 *   📤 Share Code / Share (guest links) → <Icon name="action.share" />
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../../../components/ui/Icon';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useMembers } from '../../../hooks/useMembers';
import { buildGuestUrl } from '../../../services/memberService';
import { getTrip, regenerateJoinCode } from '../../../services/tripService';
import { useTripStore } from '../../../stores/tripStore';
import type { Trip } from '../../../types/domain';
import { isJoinCodeExpired, joinCodeSecondsRemaining } from '../../../utils/joinCode';
import { spacing, typography, radii, shadows } from '@/theme';

const QR_PREFIX = 'settravo://join?code=';

function fmtCountdown(s: number): string {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function QRScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const members = useMembers(tripId ?? '');
    const guestMembers = members.filter((m) => m.isGuest && m.guestToken);

    const [trip, setTrip] = useState<Trip | null>(null);
    const [loading, setLoading] = useState(true);
    const [regenerating, setRegenerating] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);

    const loadTrip = useCallback(async () => {
        if (!tripId) return;
        setLoading(true);
        try {
            const t = await getTrip(tripId);
            setTrip(t);
            if (t) setSecondsLeft(joinCodeSecondsRemaining(t.joinCodeExpiresAt));
        } finally {
            setLoading(false);
        }
    }, [tripId]);

    useEffect(() => { loadTrip(); }, [loadTrip]);

    useEffect(() => {
        if (!trip || isJoinCodeExpired(trip.joinCodeExpiresAt)) return;
        const timer = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) { clearInterval(timer); return 0; }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [trip]);

    const handleRegenerate = useCallback(async () => {
        if (!tripId) return;
        setRegenerating(true);
        try {
            const updated = await regenerateJoinCode(tripId);
            setTrip(updated);
            setSecondsLeft(joinCodeSecondsRemaining(updated.joinCodeExpiresAt));
            const { trips, setTrips } = useTripStore.getState();
            setTrips(trips.map((t) => (t.id === tripId ? updated : t)));
        } finally {
            setRegenerating(false);
        }
    }, [tripId]);

    const handleShareCode = useCallback(async () => {
        if (!trip?.joinCode) return;
        await Share.share({ message: `Join "${trip.name}" on Settravo! Code: ${trip.joinCode}` });
    }, [trip]);

    const handleShareGuestLink = useCallback(async (memberId: string) => {
        const member = members.find((m) => m.id === memberId);
        if (!member) return;
        const url = buildGuestUrl(member);
        if (!url) return;
        await Share.share({
            message: `Hi ${member.displayName}! Check your balance for "${trip?.name}":\n${url}`,
            url,
        });
    }, [members, trip]);

    const expired = !trip || isJoinCodeExpired(trip.joinCodeExpiresAt);
    const qrValue = trip?.joinCode ? `${QR_PREFIX}${trip.joinCode}` : '';
    const isLowTime = secondsLeft < 120;

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.accent} />
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.separator }]}>
                <Pressable
                    style={styles.headerBtn}
                    onPress={() => router.back()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Icon name="header.back" size={24} color={colors.accent} />
                </Pressable>
                <Text style={[typography.bodyMd, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                    Share Group
                </Text>
                <View style={styles.headerBtn} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl, textAlign: 'center' }]}>
                    Others scan this to join {trip?.name ?? 'the trip'}.
                </Text>

                {/* QR card — always white so QR scanners work regardless of theme */}
                <View style={[styles.qrCard, { backgroundColor: '#FFFFFF', ...shadows.mid }]}>
                    {!expired && qrValue ? (
                        <QRCode value={qrValue} size={220} color="#000000" backgroundColor="#FFFFFF" />
                    ) : (
                        <View style={styles.expiredBox}>
                            <Icon name="status.syncing" size={48} color={colors.textSecondary} />
                            <Text style={[typography.bodyMd, { color: colors.textSecondary }]}>
                                Code expired
                            </Text>
                        </View>
                    )}
                </View>

                {/* Code display + countdown */}
                {!expired && trip?.joinCode && (
                    <View style={styles.codeRow}>
                        <Text style={[styles.codeDisplay, { color: colors.text }]}>
                            {trip.joinCode}
                        </Text>
                        <Text style={[typography.caption, { color: isLowTime ? colors.warning : colors.textSecondary }]}>
                            Expires in {fmtCountdown(secondsLeft)}
                        </Text>
                    </View>
                )}

                {/* Actions */}
                <View style={styles.actions}>
                    <Pressable
                        style={[
                            styles.secondaryBtn,
                            { backgroundColor: colors.card, borderColor: colors.cardBorder },
                            regenerating && styles.disabled,
                        ]}
                        onPress={handleRegenerate}
                        disabled={regenerating}
                        accessibilityRole="button"
                        accessibilityLabel="Regenerate join code"
                    >
                        {regenerating ? (
                            <ActivityIndicator color={colors.accent} />
                        ) : (
                            <>
                                <Icon name="action.refresh" size={18} color={colors.icon} />
                                <Text style={[typography.bodyMd, { color: colors.text }]}>New Code</Text>
                            </>
                        )}
                    </Pressable>

                    <Pressable
                        style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
                        onPress={handleShareCode}
                        disabled={!trip?.joinCode}
                        accessibilityRole="button"
                        accessibilityLabel="Share join code"
                    >
                        <Icon name="action.share" size={18} color={colors.textInverse} />
                        <Text style={[typography.bodyMd, { color: colors.textInverse }]}>Share Code</Text>
                    </Pressable>
                </View>

                {/* Guest member links */}
                {guestMembers.length > 0 && (
                    <View style={styles.guestSection}>
                        <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                            GUEST LINKS
                        </Text>
                        {guestMembers.map((m) => (
                            <Pressable
                                key={m.id}
                                style={[styles.guestRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                                onPress={() => handleShareGuestLink(m.id)}
                                accessibilityRole="button"
                                accessibilityLabel={`Share link for ${m.displayName}`}
                            >
                                <View style={styles.guestInfo}>
                                    <Text style={[typography.bodyMd, { color: colors.text }]}>{m.displayName}</Text>
                                    <Text style={[typography.caption, { color: colors.textSecondary }]}>Guest</Text>
                                </View>
                                <View style={styles.guestShareBtn}>
                                    <Icon name="action.share" size={14} color={colors.accent} />
                                    <Text style={[typography.caption, { color: colors.accent }]}>Share</Text>
                                </View>
                            </Pressable>
                        ))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
    qrCard: {
        padding: spacing.lg,
        borderRadius: radii.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
        minHeight: 260,
    },
    expiredBox: { alignItems: 'center', gap: spacing.sm },
    codeRow: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
    codeDisplay: {
        fontSize: 36,
        fontWeight: '800',
        letterSpacing: 12,
        fontVariant: ['tabular-nums'],
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.sm,
        width: '100%',
        marginBottom: spacing.xl,
    },
    secondaryBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        height: 48,
        borderRadius: radii.md,
        borderWidth: 1,
    },
    primaryBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        height: 48,
        borderRadius: radii.md,
    },
    disabled: { opacity: 0.5 },
    guestSection: { width: '100%' },
    guestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: 1,
        marginBottom: spacing.sm,
    },
    guestInfo: { gap: 2 },
    guestShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});