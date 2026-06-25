/**
 * memberService.ts
 *
 * All TravelAppMembers read/write operations that aren't part of the
 * trip create/join flow (which lives in tripService.ts).
 *
 * Responsible for:
 *  - Fetching members for a trip (used by the member store)
 *  - Generating the guest share URL for a member token
 *  - Removing yourself from a trip
 *
 * Fix: typo `leaveThrip` → `leaveTrip`
 */

import { supabase } from '../lib/supabase';
import type { Member } from '../types/domain';
import type { Database } from '../types/supabase';

type MemberRow = Database['public']['Tables']['TravelAppMembers']['Row'];

function mapMember(row: MemberRow): Member {
    return {
        id: row.id,
        tripId: row.trip_id,
        deviceId: row.device_id,
        displayName: row.display_name,
        joinedAt: row.joined_at,
        guestToken: row.guest_token,
        isGuest: row.device_id === null,
    };
}

/**
 * Fetch all members of a trip.
 * RLS: caller must be a member of the trip.
 */
export async function fetchMembers(tripId: string): Promise<Member[]> {
    const { data, error } = await supabase
        .from('TravelAppMembers')
        .select('*')
        .eq('trip_id', tripId)
        .order('joined_at', { ascending: true });

    if (error) throw new Error(`[memberService] fetchMembers: ${error.message}`);
    return (data ?? []).map(mapMember);
}

/**
 * Build the shareable guest URL for a member.
 *
 * Format: https://<host>/guest?token=<guest_token>
 *
 * The base URL comes from EXPO_PUBLIC_GUEST_BASE_URL (set in .env.local
 * and in EAS Hosting / external hosting env vars).
 * Falls back to localhost:8081 for local dev only.
 *
 * Returns null if the member is not a guest (has a real device_id) —
 * full app users don't need a guest link.
 *
 * NOTE: For your separate website at billspilter.sapphirepegasus.com,
 * set EXPO_PUBLIC_GUEST_BASE_URL=https://billspilter.sapphirepegasus.com
 * in your EAS environment and in the app's .env.production file.
 */
export function buildGuestUrl(member: Member): string | null {
    if (!member.guestToken || !member.isGuest) return null;

    const base =
        process.env.EXPO_PUBLIC_GUEST_BASE_URL ??
        'http://localhost:8081';

    // Ensure no trailing slash
    const cleanBase = base.replace(/\/$/, '');

    return `${cleanBase}/guest?token=${encodeURIComponent(member.guestToken)}`;
}

/**
 * Remove the calling device from a trip (leave).
 * RLS "Member can remove themselves" enforces this is self-only.
 *
 * Fix: was named `leaveThrip` (typo) — now correctly named `leaveTrip`.
 */
export async function leaveTrip(memberId: string): Promise<void> {
    const { error } = await supabase
        .from('TravelAppMembers')
        .delete()
        .eq('id', memberId);

    if (error) throw new Error(`[memberService] leaveTrip: ${error.message}`);
}