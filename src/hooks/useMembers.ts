/**
 * useMembers.ts
 *
 * Hook that loads members for a trip into memberStore (once per tripId).
 *
 * Always fetches fresh on mount (tripId change). The cached list from a
 * previous fetch is shown immediately while the request is in flight to
 * avoid blank states, then replaced with the server response.
 *
 * getSnapshot stability: EMPTY_MEMBERS is a module-level constant so the
 * Zustand selector always returns the same reference when no members are
 * cached, satisfying React 18's getSnapshot caching requirement.
 */

import { useEffect, useRef } from 'react';
import { fetchMembers } from '../services/memberService';
import { useMemberStore } from '../stores/memberStore';
import type { Member } from '../types/domain';

const EMPTY_MEMBERS: Member[] = [];

export function useMembers(tripId: string) {
    const members = useMemberStore(
        (s) => s.members[tripId] ?? EMPTY_MEMBERS,
    );
    const setMembers = useMemberStore((s) => s.setMembers);

    // Track whether we've initiated a fetch for the current tripId
    // in this hook instance (not shared across hook instances).
    const fetchedForTripId = useRef<string | null>(null);

    useEffect(() => {
        if (!tripId) return;
        // Always fetch when tripId changes (new navigation) or on first mount.
        if (fetchedForTripId.current === tripId) return;

        fetchedForTripId.current = tripId;
        let mounted = true;

        fetchMembers(tripId)
            .then((fetched) => {
                if (mounted) {
                    setMembers(tripId, fetched);
                }
            })
            .catch((err) => console.error('[useMembers] fetch failed:', err));

        return () => {
            mounted = false;
        };
    }, [tripId, setMembers]);

    return members;
}