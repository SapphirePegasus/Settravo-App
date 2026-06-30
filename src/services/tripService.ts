/**
 * tripService.ts
 *
 * All trip-related Supabase operations.
 *
 * Rules:
 *  - createTrip and joinTrip → Edge Function "trip-action" (rate limiting + atomic write)
 *  - fetch/read ops → direct Supabase (RLS is the gate, no mutation risk)
 *  - All inputs Zod-validated before any network call
 *  - Returns domain types only — raw DB rows never leave this file
 */

import * as ExpoCrypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type { Member, Trip } from '../types/domain';
import type { Database } from '../types/supabase';
import { AppError } from '@/errors/AppError';

import { generateExpiresAt, generateJoinCode } from '../utils/joinCode';
import {
    CreateTripSchema,
    JoinTripSchema,
    type CreateTripInput,
    type JoinTripInput,
} from '../validation/schemas';
import { mapMember } from './memberService';
import type { FunctionsHttpError } from '@supabase/supabase-js';

async function extractFunctionError(error: unknown): Promise<string> {
    try {
        // FunctionsHttpError is the Supabase SDK type for non-2xx Edge Function responses.
        // It has a .context.response property which is a standard Response object.
        const httpError = error as FunctionsHttpError;
        if (httpError?.context?.response) {
            const body = await httpError.context.response.json() as { error?: string };
            if (typeof body?.error === 'string' && body.error.length > 0) {
                return body.error;
            }
        }
    } catch {
        // Body is not JSON or has already been consumed — fall through to generic message
    }
    return error instanceof Error ? error.message : 'Unknown error';
}

type TripRow = Database['public']['Tables']['TravelAppTrips']['Row'];
type MemberRow = Database['public']['Tables']['TravelAppMembers']['Row'];

function mapTrip(row: TripRow): Trip {
    return {
        id: row.id,
        name: row.name,
        destination: row.destination,
        startDate: row.start_date,
        endDate: row.end_date,
        createdByDevice: row.created_by_device,
        createdAt: row.created_at,
        joinCode: row.join_code,
        joinCodeExpiresAt: row.join_code_expires_at,
    };
}

/**
 * Generate a RFC 4122 v4 UUID.
 * Uses crypto.randomUUID() when available (Hermes RN 0.73+, Expo 50+).
 * Falls back to a manual implementation using crypto.getRandomValues()
 * which IS available in all Hermes versions.
 * The fallback produces a spec-compliant v4 UUID string.
 */
/*function generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    // getRandomValues is always available in Hermes / Expo 50+.
    // If it is somehow absent, we hard-fail rather than silently degrade to
    // Math.random — a non-CSPRNG must never generate a guest_token credential.
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
        throw new AppError(
            'UNKNOWN',
            '[security] crypto.getRandomValues is unavailable — cannot generate a secure UUID.',
        );
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version 4 bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set RFC 4122 variant bits
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0'));
    return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join(''),
    ].join('-');
}*/

function generateUUID(): string {
    return ExpoCrypto.randomUUID();
}

/**
 * Create a new trip. Routes through the "trip-action" Edge Function
 * which atomically inserts the trip + the creator as first member.
 */
export async function createTrip(input: CreateTripInput, creatorDisplayName: string): Promise<Trip> {

    const validated = CreateTripSchema.parse(input);

    // ── DIAGNOSTIC PROBE — remove after fix ──────────────────────────────────
    /*try {
        const { data: { session } } = await supabase.auth.getSession();
        const probeUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/trip-action`;

        console.log('[createTrip:probe] URL:', probeUrl);
        console.log('[createTrip:probe] session uid:', session?.user.id ?? 'NO SESSION');
        console.log('[createTrip:probe] JWT present:', Boolean(session?.access_token));

        const probeRes = await fetch(probeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token ?? ''}`,
                'apikey': process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
            },
            body: JSON.stringify({
                action: 'create',
                payload: {
                    name:                 validated.name,
                    destination:          validated.destination ?? null,
                    start_date:           validated.startDate ?? null,
                    end_date:             validated.endDate ?? null,
                    creator_display_name: creatorDisplayName,
                },
            }),
        });

        const probeBody = await probeRes.text();
        console.log('[createTrip:probe] status:', probeRes.status);
        console.log('[createTrip:probe] body:', probeBody);
    } catch (probeErr) {
        console.error('[createTrip:probe] fetch threw:', probeErr);
    }*/
    // ── END DIAGNOSTIC PROBE ─────────────────────────────────────────────────

    const { data, error } = await supabase.functions.invoke<{ trip: TripRow }>('trip-action', {
        body: {
            action: 'create',
            payload: {
                name: validated.name,
                destination: validated.destination ?? null,
                start_date: validated.startDate ?? null,
                end_date: validated.endDate ?? null,
                creator_display_name: creatorDisplayName,
            },
        },
    });

    if (error) {
        const message = await extractFunctionError(error);
        throw new AppError('SERVER', `[tripService] createTrip: ${message}`);
    }
    if (!data?.trip) {
        throw new AppError('SERVER', '[tripService] createTrip: no trip data returned');
    }

    return mapTrip(data.trip);
}

/**
 * Join an existing trip by 4-char join code.
 * Edge Function validates code TTL, duplicate membership, and handles guest claim.
 */
export async function joinTrip(input: JoinTripInput): Promise<Trip> {
    const validated = JoinTripSchema.parse(input);

    const { data, error } = await supabase.functions.invoke<{ trip: TripRow }>('trip-action', {
        body: {
            action: 'join',
            payload: {
                join_code: validated.joinCode,
                display_name: validated.displayName,
            },
        },
    });

    if (error) {
        const message = await extractFunctionError(error);
        // 404 = invalid/expired code; 410 = explicitly expired
        throw new AppError('NOT_FOUND', `[tripService] joinTrip: ${message}`);
    }
    if (!data?.trip) {
        throw new AppError('SERVER', '[tripService] joinTrip: no trip data returned');
    }

    return mapTrip(data.trip);
}

/** Fetch all trips this device has joined (RLS scoped). */
export async function fetchMyTrips(): Promise<Trip[]> {
    const { data, error } = await supabase
        .from('TravelAppTrips')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(`[tripService] fetchMyTrips failed: ${error.message}`);
    return (data ?? []).map(mapTrip);
}

/** Fetch a single trip. Returns null if not found or not a member (RLS). */
export async function getTrip(tripId: string): Promise<Trip | null> {
    const { data, error } = await supabase
        .from('TravelAppTrips')
        .select('*')
        .eq('id', tripId)
        .maybeSingle();

    if (error) throw new Error(`[tripService] getTrip failed: ${error.message}`);
    return data ? mapTrip(data) : null;
}

/** Fetch all members of a trip (RLS: caller must be a member). */
export async function getTripMembers(tripId: string): Promise<Member[]> {
    const { data, error } = await supabase
        .from('TravelAppMembers')
        .select('*')
        .eq('trip_id', tripId)
        .order('joined_at', { ascending: true });

    if (error) throw new Error(`[tripService] getTripMembers failed: ${error.message}`);
    return (data ?? []).map(mapMember);
}

/**
 * Regenerate join code (creator only — RLS "creator can update their trip" enforces this).
 * Issues a new 4-char code with a fresh 30-min TTL.
 */
export async function regenerateJoinCode(tripId: string): Promise<Trip> {
    const { data, error } = await supabase
        .from('TravelAppTrips')
        .update({
            join_code: generateJoinCode(),
            join_code_expires_at: generateExpiresAt(),
        })
        .eq('id', tripId)
        .select()
        .single();

    if (error) throw new Error(`[tripService] regenerateJoinCode failed: ${error.message}`);
    return mapTrip(data);
}

/**
 * Add a guest member (by name, no device). Generates a spec-compliant
 * UUID v4 guest_token for the shareable per-member web URL (Phase 4).
 *
 * Uses crypto.randomUUID() when available, with a getRandomValues-based
 * fallback that always produces a valid UUID — never a malformed string
 * that Postgres would reject with "invalid input syntax for type uuid".
 */
export async function addGuestMember(
    tripId: string,
    displayName: string,
): Promise<Member> {
    const { data, error } = await supabase
        .from('TravelAppMembers')
        .insert({
            trip_id: tripId,
            device_id: null,
            display_name: displayName.trim(),
            guest_token: generateUUID(),
        })
        .select()
        .single();

    if (error) throw new Error(`[tripService] addGuestMember failed: ${error.message}`);
    return mapMember(data);
}