/**
 * useMembers.ts
 *
 * Loads members for a trip into memberStore — Phase-3 cache-first version.
 *
 *  1. Hydrate instantly from the SQLite cache (offline-safe, no blank state).
 *  2. Fetch fresh from the network; on success, replace + write through.
 *  3. On fetch failure the cached list simply remains — stale beats empty.
 *
 * getSnapshot stability: EMPTY_MEMBERS is a module-level constant so the
 * Zustand selector always returns the same reference when no members are
 * cached, satisfying React 18's getSnapshot caching requirement.
 */

import { useEffect, useRef } from 'react';
import { cacheMembers, readCachedMembers } from '../lib/localCache';
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
        if (fetchedForTripId.current === tripId) return;

        fetchedForTripId.current = tripId;
        let mounted = true;

        // 1. Instant cache hydration (synchronous) — only when the store has
        //    nothing yet, so we never downgrade fresher in-memory data.
        const current = useMemberStore.getState().members[tripId];
        if (!current || current.length === 0) {
            const cached = readCachedMembers(tripId);
            if (cached.length > 0) {
                setMembers(tripId, cached);
            }
        }

        // 2. Network refresh + write-through.
        fetchMembers(tripId)
            .then((fetched) => {
                if (mounted) {
                    setMembers(tripId, fetched);
                    cacheMembers(tripId, fetched);
                }
            })
            .catch((err) => {
                // Offline or transient failure: the cached list stays on screen.
                console.warn('[useMembers] fetch failed (cache remains):', err);
            });

        return () => {
            mounted = false;
        };
    }, [tripId, setMembers]);

    return members;
}