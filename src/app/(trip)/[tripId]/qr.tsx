/**
 * app/(trip)/[tripId]/qr.tsx — QR Code + Share screen (Phase 4)
 *
 * Phase 4 additions:
 *  - Per-member guest link buttons at the bottom.
 *    Each unclaimed guest member gets a "Send [name]'s link" button
 *    that shares their personal guest URL via the native Share sheet.
 *  - Members loaded from memberStore (no extra fetch if already cached).
 */

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useMembers } from '../../../hooks/useMembers';
import { buildGuestUrl } from '../../../services/memberService';
import { getTrip, regenerateJoinCode } from '../../../services/tripService';
import { useTripStore } from '../../../stores/tripStore';
import type { Trip } from '../../../types/domain';
import { isJoinCodeExpired, joinCodeSecondsRemaining } from '../../../utils/joinCode';
import { useThemeColors } from '../../../hooks/useThemeColors';

const QR_PREFIX = 'settravo://join?code=';

export default function QRScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
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

    const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.bg} />
            </View>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.bg }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            <Text style={[styles.heading, { color: colors.text }]}>Join with QR</Text>
            <Text style={[styles.sub, { color: colors.subText }]}>
                Others scan this to join {trip?.name ?? 'the trip'}.
            </Text>

            {/* QR card */}
            <View style={[styles.qrCard, { backgroundColor: '#ffffff' }]}>
                {!expired && qrValue ? (
                    <QRCode value={qrValue} size={220} color="#000000" backgroundColor="#ffffff" />
                ) : (
                    <View style={styles.expiredBox}>
                        <Text style={styles.expiredIcon}>⏱</Text>
                        <Text style={styles.expiredText}>Code expired</Text>
                    </View>
                )}
            </View>

            {!expired && trip?.joinCode && (
                <>
                    <Text style={[styles.codeDisplay, { color: colors.text }]}>{trip.joinCode}</Text>
                    <Text style={[styles.countdown, { color: secondsLeft < 120 ? colors.warningText : colors.subText }]}>
                        Expires in {fmt(secondsLeft)}
                    </Text>
                </>
            )}

            {/* Main actions */}
            <View style={styles.actions}>
                <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: colors.card, opacity: regenerating ? 0.6 : 1 }]}
                    onPress={handleRegenerate}
                    disabled={regenerating}
                >
                    {regenerating ? <ActivityIndicator color={colors.text} /> : (
                        <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                            {expired ? 'Generate New Code' : 'Regenerate'}
                        </Text>
                    )}
                </Pressable>
                {!expired && (
                    <Pressable
                        style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
                        onPress={handleShareCode}
                    >
                        <Text style={styles.primaryBtnText}>Share Code</Text>
                    </Pressable>
                )}
            </View>

            {/* Guest member links */}
            {guestMembers.length > 0 && (
                <View style={styles.guestSection}>
                    <Text style={[styles.guestSectionTitle, { color: colors.subText }]}>
                        Share personal balance links
                    </Text>
                    <Text style={[styles.guestSectionSub, { color: colors.subText }]}>
                        These members don't have the app yet. Send them their own balance link.
                    </Text>
                    {guestMembers.map((m) => (
                        <Pressable
                            key={m.id}
                            style={[styles.guestLinkBtn, { backgroundColor: colors.card }]}
                            onPress={() => handleShareGuestLink(m.id)}
                        >
                            <Text style={[styles.guestLinkName, { color: colors.text }]}>
                                {m.displayName}
                            </Text>
                            <Text style={[styles.guestLinkAction, { color: colors.accent }]}>
                                Send link →
                            </Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 24, alignItems: 'center', paddingBottom: 48 },
    heading: { fontSize: 24, fontWeight: '700', marginBottom: 6, alignSelf: 'flex-start' },
    sub: { fontSize: 15, marginBottom: 32, alignSelf: 'flex-start' },
    qrCard: { width: 260, height: 260, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    expiredBox: { alignItems: 'center' },
    expiredIcon: { fontSize: 48, marginBottom: 8 },
    expiredText: { fontSize: 16, color: '#888' },
    codeDisplay: { fontSize: 32, fontWeight: '700', letterSpacing: 6, marginBottom: 6 },
    countdown: { fontSize: 14, marginBottom: 24 },
    actions: { width: '100%', gap: 12, marginBottom: 32 },
    primaryBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    secondaryBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    secondaryBtnText: { fontSize: 16, fontWeight: '500' },
    guestSection: { width: '100%' },
    guestSectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
    guestSectionSub: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
    guestLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 16, marginBottom: 10 },
    guestLinkName: { fontSize: 16, fontWeight: '500' },
    guestLinkAction: { fontSize: 15, fontWeight: '500' },
});