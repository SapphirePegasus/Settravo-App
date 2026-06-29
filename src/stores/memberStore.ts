/**
 * memberStore.ts
 *
 * Zustand store for members, keyed by tripId.
 *
 * Why a separate store (not just local state in the trip detail screen)?
 *  - The settle screen needs member names to render settlement rows.
 *  - The add-expense screen needs the member list for the paid-by picker.
 *  - Fetching members in each screen independently causes duplicate requests
 *    and flicker. One store, one fetch per tripId.
 *
 * Cache strategy:
 *  - `hasFetched[tripId]` is reset to false on every navigation into a trip
 *    so the member list is always refreshed from the server. This prevents
 *    the stale-empty-list bug where an early fetch (before the Supabase
 *    session was fully ready) returned [] and locked hasFetched=true forever.
 *  - The member list itself is NOT cleared on reset — the previous list
 *    remains visible while the fresh fetch is in flight, avoiding a flash.
 */

import { create } from 'zustand';
import type { Member } from '../types/domain';

interface MemberState {
    /** members[tripId] → Member[] */
    members: Record<string, Member[]>;
    /** hasFetched[tripId] → true once the initial fetch completes */
    hasFetched: Record<string, boolean>;

    setMembers: (tripId: string, members: Member[]) => void;
    addMember: (tripId: string, member: Member) => void;
    removeMember: (tripId: string, memberId: string) => void;
    /** Update a member's fields (e.g. when guest claims their account) */
    updateMember: (tripId: string, memberId: string, patch: Partial<Member>) => void;
    /** Clear cached members for a trip (e.g. on leave) */
    clearTrip: (tripId: string) => void;
    /**
     * Reset only the hasFetched flag for a trip, keeping the cached member
     * list intact so the UI shows stale data rather than nothing while the
     * fresh fetch is in flight. Call this on every navigation into a trip.
     */
    resetFetched: (tripId: string) => void;
}

export const useMemberStore = create<MemberState>((set) => ({
    members: {},
    hasFetched: {},

    setMembers: (tripId, members) =>
        set((s) => ({
            members: { ...s.members, [tripId]: members },
            hasFetched: { ...s.hasFetched, [tripId]: true },
        })),

    addMember: (tripId, member) =>
        set((s) => ({
            members: {
                ...s.members,
                [tripId]: [
                    ...(s.members[tripId] ?? []).filter((m) => m.id !== member.id),
                    member,
                ],
            },
        })),

    removeMember: (tripId, memberId) =>
        set((s) => ({
            members: {
                ...s.members,
                [tripId]: (s.members[tripId] ?? []).filter((m) => m.id !== memberId),
            },
        })),

    updateMember: (tripId, memberId, patch) =>
        set((s) => ({
            members: {
                ...s.members,
                [tripId]: (s.members[tripId] ?? []).map((m) =>
                    m.id === memberId ? { ...m, ...patch } : m,
                ),
            },
        })),

    clearTrip: (tripId) =>
        set((s) => {
            const members = { ...s.members };
            const hasFetched = { ...s.hasFetched };
            delete members[tripId];
            delete hasFetched[tripId];
            return { members, hasFetched };
        }),

    resetFetched: (tripId) =>
        set((s) => ({
            hasFetched: { ...s.hasFetched, [tripId]: false },
        })),
}));