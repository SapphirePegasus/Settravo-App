/**
 * realtimeService.ts
 *
 * Manages the Supabase Realtime subscription for a single trip channel.
 * One channel per active trip: "trip:{tripId}"
 * Listens to postgres_changes on TravelAppExpenses and TravelAppSplits.
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
 *  - Call subscribeToTrip() when navigating into a trip screen.
 *  - Call the returned unsubscribe() when navigating away.
 *  - Never call subscribeToTrip() for the same tripId twice without
 *    calling the previous unsubscribe first — this leaks channels.
 *
 * ⚠️  Supabase Realtime requires tables to be added to the publication:
 *      ALTER PUBLICATION supabase_realtime ADD TABLE "TravelAppExpenses";
 *      ALTER PUBLICATION supabase_realtime ADD TABLE "TravelAppSplits";
 *    Do this once in the Supabase SQL editor. Without it, no change events fire.
 */

/**
 * realtimeService.ts — Supabase Realtime subscription for a single trip.
 *
 * Changes vs previous version:
 *  - Calls setChannelMounted(true) on subscribe start, setChannelMounted(false)
 *    on teardown, so the ConnectionBanner only appears when a channel is
 *    actually expected to be live (fixes persistent "Reconnecting" on home screen).
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
     * Manually re-initiates the connection after max retries have been exceeded.
     * Wire this to a "Tap to retry" button in ConnectionBanner.
     */
    reconnect: () => void;
}

export function subscribeToTrip(tripId: string): RealtimeSubscription {
    let channel: RealtimeChannel | null = null;
    let attempt = 0;
    let isReconnecting = false;
    let isTornDown = false;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;

    const { setRealtimeStatus, setChannelMounted } = useConnectionStore.getState();
    const { applyExpensePatch, applySplitPatch } = useExpenseStore.getState();

    // Signal that a channel is actively mounted
    setChannelMounted(true);

    function clearBackoffTimer() {
        if (backoffTimer !== null) {
            clearTimeout(backoffTimer);
            backoffTimer = null;
        }
    }

    function removeCurrentChannel() {
        if (channel) {
            void supabase.removeChannel(channel);
            channel = null;
        }
    }

    function connect() {
        if (isTornDown) return;

        setRealtimeStatus('reconnecting');

        channel = supabase
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
                    attempt = 0;
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
                    attempt = 0;
                    applySplitPatch(payload);
                },
            )
            .subscribe((status, err) => {
                if (attempt >= MAX_RETRIES) {
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

                if (isTornDown) return;

                if (status === 'SUBSCRIBED') {
                    attempt = 0;
                    isReconnecting = false;
                    setRealtimeStatus('connected');
                    return;
                }

                if (
                    (status === 'CHANNEL_ERROR' || status === 'CLOSED') &&
                    !isReconnecting
                ) {
                    isReconnecting = true;
                    setRealtimeStatus('reconnecting');

                    if (err) {
                        console.warn(`[realtimeService] Channel ${status}:`, err.message);
                    }

                    if (attempt >= MAX_RETRIES) {
                        console.error(
                            `[realtimeService] Max retries (${MAX_RETRIES}) reached for trip:${tripId}.`,
                        );
                        setRealtimeStatus('disconnected');
                        return;
                    }

                    const delay = backoffDelay(attempt);
                    attempt += 1;

                    backoffTimer = setTimeout(() => {
                        if (isTornDown) return;
                        isReconnecting = false;
                        removeCurrentChannel();
                        connect();
                    }, delay);
                }

                if (status === 'TIMED_OUT') {
                    console.warn('[realtimeService] Channel timed out.');
                }
            });
    }

    connect();

    return {
        unsubscribe: () => {
            isTornDown = true;
            clearBackoffTimer();
            removeCurrentChannel();
            setRealtimeStatus('disconnected');
            setChannelMounted(false);
        },
        reconnect: () => {
            // Guard: only allow manual reconnect after the backoff loop has
            // exhausted (status === 'disconnected' and isTornDown is false).
            // If already reconnecting, this is a no-op.
            if (isTornDown || isReconnecting) return;
            attempt = 0; // Reset attempt counter for a fresh backoff sequence
            isReconnecting = false;
            connect();
        },
    };
}