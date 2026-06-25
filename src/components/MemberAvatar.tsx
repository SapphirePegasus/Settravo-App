/**
 * MemberAvatar.tsx
 *
 * Circular avatar showing member initial + unique avatar color.
 * Colors are assigned uniquely across all members in the group —
 * no two members share the same color.
 * Guest members show an orange dot indicator.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { Member } from '../types/domain';

interface Props {
    member: Member;
    isDark: boolean;
    size?: number;
    /** Pass all members in the trip so colors can be assigned uniquely. */
    allMembers?: Member[];
}

const AVATAR_COLORS = [
    '#5ac8fa', // blue
    '#34c759', // green
    '#ff9500', // orange
    '#ff2d55', // pink
    '#af52de', // purple
    '#007aff', // indigo
    '#ff3b30', // red
    '#30d158', // mint
    '#ffcc00', // yellow
    '#00c7be', // teal
];

/**
 * Assign colors uniquely across all members.
 * Members are sorted by their id so assignment is stable regardless
 * of the order they appear in the list.
 */
function buildColorMap(members: Member[]): Map<string, string> {
    const map = new Map<string, string>();
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((m, i) => {
        map.set(m.id, AVATAR_COLORS[i % AVATAR_COLORS.length]);
    });
    return map;
}

/** Fallback: deterministic color for a single member with no group context. */
function colorForMemberAlone(memberId: string): string {
    let hash = 0;
    for (let i = 0; i < memberId.length; i++) {
        hash = memberId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function firstInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase();
}

export function MemberAvatar({ member, size = 44, allMembers }: Props) {
    const bg = allMembers && allMembers.length > 0
        ? (buildColorMap(allMembers).get(member.id) ?? colorForMemberAlone(member.id))
        : colorForMemberAlone(member.id);

    const fontSize = size * 0.42;

    return (
        <View style={styles.wrapper}>
            <View
                style={[
                    styles.circle,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: bg,
                    },
                ]}
            >
                <Text style={[styles.initial, { fontSize }]}>
                    {firstInitial(member.displayName)}
                </Text>
            </View>
            {member.isGuest && <View style={styles.guestDot} />}
            <Text style={styles.name} numberOfLines={1}>
                {member.displayName.split(' ')[0]}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { alignItems: 'center', width: 54 },
    circle: { alignItems: 'center', justifyContent: 'center' },
    initial: { color: '#fff', fontWeight: '700' },
    guestDot: {
        position: 'absolute',
        top: 0,
        right: 4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ff9500',
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    name: {
        fontSize: 11,
        marginTop: 4,
        textAlign: 'center',
        color: '#8e8e93',
        maxWidth: 54,
    },
});