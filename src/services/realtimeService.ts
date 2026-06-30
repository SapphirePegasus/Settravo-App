/**
 * realtimeService.ts
 *
 * Manages the Supabase Realtime subscription for a single trip channel.
 * One LOGICAL channel per tripId: "trip:{tripId}" — shared across every
 * `useExpenses(tripId)` hook instance currently mounted for that trip
 * (e.g. index.tsx, activity.tsx, settle.tsx, all within the same
 * `(trip)/[tripId]` stack, which Expo Router keeps frozen-not-unmounted
 * when navigating between sibling screens).
 *
 * ⚠️ CRITICAL — why this is reference-counted (do not "simplify" this away):
 *   `RealtimeClient.channel(topic)` in @supabase/supabase-js dedupes by
 *   topic string. If a channel for `realtime:trip:{tripId}` already exists
 *   in the client's internal registry, calling `supabase.channel(topic)`
 *   again returns THAT SAME object — even if it is already SUBSCRIBED.
 *   Calling `.on('postgres_changes', ...)` on an already-subscribed channel
 *   throws: "cannot add postgres_changes callbacks ... after subscribe()".
 *   Multiple independent callers for the same tripId therefore MUST share
 *   one underlying channel; only the first caller may construct+subscribe
 *   it, and it may only be torn down once every caller has released it.
 *
 * Reconnect strategy (confirmed against Supabase Discussion #27513):
 *  - CHANNEL_ERROR and CLOSED are the same incident — guard with
 *    `isReconnecting` flag to prevent double-scheduling two backoff timers.
 *  - Exponential backoff: base 3s, multiplier 2x, cap 60s, max 8 attempts.
 *  - After max attempts, surface an error via onStatusChange and stop retrying.
 *    The user will see the ConnectionBanner in "offline" state permanently
 *    until they background/foreground the app (which triggers a full remount).
 *
 * Caller responsibilities:
 *  - Call subscribeToTrip(tripId) on mount; it is safe to call this from
 *    multiple components for the same tripId at the same time.
 *  - Call the returned unsubscribe() exactly once per subscribeToTrip()
 *    call, on cleanup. Calling it more than once is a safe no-op.
 *
 * ⚠️  Supabase Realtime requires tables to be added to the publication:
 *      ALTER PUBLICATION supabase_realtime ADD TABLE "TravelAppExpenses";
 *      ALTER PUBLICATION supabase_realtime ADD TABLE "TravelAppSplits";
 *    Do this once in the Supabase SQL editor. Without it, no change events fire.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useConnectionStore } from '../stores/connectionStore';
import { useExpenseStore } from '../stores/expenseStore';
import * as Sentry from '@sentry/react-native';

const BACKOFF_BASE_MS = 3_000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_CAP_MS = 60_000;
const MAX_RETRIES = 8;

function backoffDelay(attempt: number): number {
    return Math.min(BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, attempt), BACKOFF_CAP_MS);
}

export interface RealtimeSubscription {
    unsubscribe: () => void;
    /**
     * Manually re-initiates the connection after max retries have been
     * exceeded. Wire this to a "Tap to retry" button in ConnectionBanner.
     * Affects the shared channel for this tripId — safe to call from any
     * consumer.
     */
    reconnect: () => void;
}

interface TripChannelEntry {
    tripId: string;
    channel: RealtimeChannel | null;
    refCount: number;
    attempt: number;
    isReconnecting: boolean;
    isTornDown: boolean;
    backoffTimer: ReturnType<typeof setTimeout> | null;
}

// Module-level singleton registry: exactly one logical channel per tripId,
// shared across every consumer. This is the load-bearing fix — see the
// file header for why a non-shared implementation is unsafe.
const registry = new Map<string, TripChannelEntry>();

function clearBackoffTimer(entry: TripChannelEntry) {
    if (entry.backoffTimer !== null) {
        clearTimeout(entry.backoffTimer);
        entry.backoffTimer = null;
    }
}

function removeCurrentChannel(entry: TripChannelEntry) {
    if (entry.channel) {
        void supabase.removeChannel(entry.channel);
        entry.channel = null;
    }
}

function connect(entry: TripChannelEntry) {
    if (entry.isTornDown) return;

    const { tripId } = entry;
    const { setRealtimeStatus } = useConnectionStore.getState();
    const { applyExpensePatch, applySplitPatch } = useExpenseStore.getState();

    setRealtimeStatus('reconnecting');

    entry.channel = supabase
        .channel(`trip:${tripId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'TravelAppExpenses',
                filter: `trip_id=eq.${tripId}`,
            },
            (payload) => {
                entry.attempt = 0;
                applyExpensePatch(tripId, payload);
            },
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'TravelAppSplits',
            },
            (payload) => {
                entry.attempt = 0;
                applySplitPatch(payload);
            },
        )
        .subscribe((status, err) => {
            if (entry.isTornDown) return;

            if (status === 'SUBSCRIBED') {
                entry.attempt = 0;
                entry.isReconnecting = false;
                setRealtimeStatus('connected');
                return;
            }

            if ((status === 'CHANNEL_ERROR' || status === 'CLOSED') && !entry.isReconnecting) {
                entry.isReconnecting = true;
                setRealtimeStatus('reconnecting');

                if (err) {
                    console.warn(`[realtimeService] Channel ${status}:`, err.message);
                }

                if (entry.attempt >= MAX_RETRIES) {
                    console.error(
                        `[realtimeService] Max retries (${MAX_RETRIES}) reached for trip:${tripId}.`,
                    );
                    Sentry.captureMessage(
                        `[realtimeService] Realtime max retries for trip:${tripId}`,
                        'warning',
                    );
                    setRealtimeStatus('disconnected');
                    return;
                }

                const delay = backoffDelay(entry.attempt);
                entry.attempt += 1;

                entry.backoffTimer = setTimeout(() => {
                    if (entry.isTornDown) return;
                    entry.isReconnecting = false;
                    removeCurrentChannel(entry);
                    connect(entry);
                }, delay);
            }

            if (status === 'TIMED_OUT') {
                console.warn('[realtimeService] Channel timed out.');
            }
        });
}

export function subscribeToTrip(tripId: string): RealtimeSubscription {
    let entry = registry.get(tripId);

    if (!entry) {
        entry = {
            tripId,
            channel: null,
            refCount: 0,
            attempt: 0,
            isReconnecting: false,
            isTornDown: false,
            backoffTimer: null,
        };
        registry.set(tripId, entry);
        useConnectionStore.getState().setChannelMounted(true);
        connect(entry);
    }

    entry.refCount += 1;
    const activeEntry = entry;
    let released = false; // per-caller guard: this handle may only release its share once

    return {
        unsubscribe: () => {
            if (released) return;
            released = true;

            activeEntry.refCount -= 1;
            if (activeEntry.refCount > 0) return;

            // Last consumer for this trip — tear the real channel down.
            activeEntry.isTornDown = true;
            clearBackoffTimer(activeEntry);
            removeCurrentChannel(activeEntry);
            registry.delete(tripId);
            useConnectionStore.getState().setRealtimeStatus('disconnected');
            useConnectionStore.getState().setChannelMounted(false);
        },
        reconnect: () => {
            if (activeEntry.isTornDown || activeEntry.isReconnecting) return;
            activeEntry.attempt = 0;
            activeEntry.isReconnecting = false;
            connect(activeEntry);
        },
    };
}