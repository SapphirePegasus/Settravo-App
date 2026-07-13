/**
 * useOfflineSync.ts
 *
 * Watches network connectivity and replays the offline mutation queue.
 * Mount ONCE in the root _layout.tsx — never in individual screens.
 *
 * Phase-3 upgrades:
 *  - SETTLE_PAIR replay: settling offline is queued and replayed exactly like
 *    expenses. The server's returned rows are mirrored via applyServerSplits,
 *    correcting any optimistic drift (e.g. someone else settled first).
 *  - Retry heartbeat: previously, failed items only got another attempt when
 *    the network flipped or the queue changed — an item could sit failed for
 *    hours on stable Wi-Fi. A 30s heartbeat now re-attempts pending items
 *    while online, with per-item spacing that doubles per failure
 *    (30s → 60s → 120s → 240s, capped) to avoid hammering a struggling server.
 *  - isSyncing flag on connectionStore drives the SyncStatusBanner.
 *
 * Retry policy (unchanged): retryCount per item; after OFFLINE_MAX_RETRIES
 * the item moves to the dead-letter queue — which is now VISIBLE in the UI
 * (SyncStatusBanner) with Retry / Discard actions, instead of silently
 * swallowing the user's data.
 */

import * as Sentry from '@sentry/react-native';
import { useCallback, useEffect, useRef } from 'react';
import { cacheExpenseWithSplits, cacheSplits, removeCachedExpense } from '../lib/localCache';
import {
    addExpenseWithSplits,
    deleteExpense,
    editExpense,
    settlePairBetweenMembers,
} from '../services/expenseService';
import { useConnectionStore } from '../stores/connectionStore';
import { useExpenseStore } from '../stores/expenseStore';
import { useTripStore } from '../stores/tripStore';
import type { DeadLetterItem, OfflineQueueItem } from '../types/domain';
import { OFFLINE_MAX_RETRIES } from '../types/domain';

const HEARTBEAT_MS = 30_000;
const BASE_RETRY_SPACING_MS = 30_000;
const MAX_RETRY_SPACING_MS = 240_000;

/** Is this item due for another attempt, respecting exponential spacing? */
function isDue(item: OfflineQueueItem, now: number): boolean {
    if (!item.lastFailedAt || item.retryCount === 0) return true;
    const spacing = Math.min(
        BASE_RETRY_SPACING_MS * 2 ** Math.max(0, item.retryCount - 1),
        MAX_RETRY_SPACING_MS,
    );
    return now - Date.parse(item.lastFailedAt) >= spacing;
}

export function useOfflineSync(): void {
    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const offlineQueue = useTripStore((s) => s.offlineQueue);

    // Ref prevents concurrent replay runs within the same mounted instance
    const isReplaying = useRef(false);

    const runReplay = useCallback(async () => {
        const queue = useTripStore.getState().offlineQueue;
        if (
            !useConnectionStore.getState().networkOnline ||
            queue.length === 0 ||
            isReplaying.current
        ) {
            return;
        }

        isReplaying.current = true;
        useConnectionStore.getState().setSyncing(true);

        try {
            const now = Date.now();
            // Snapshot at replay start — items added during replay are picked
            // up by the next heartbeat / queue-change effect, not mixed in.
            const itemsToReplay = queue.filter((item) => isDue(item, now));

            for (const item of itemsToReplay) {
                const store = useTripStore.getState();
                try {
                    await replayItem(item);
                    await store.dequeueOfflineItem(item.localId);
                } catch (err) {
                    const newCount = (item.retryCount ?? 0) + 1;
                    const failedAt = new Date().toISOString();

                    if (newCount >= OFFLINE_MAX_RETRIES) {
                        const deadItem: DeadLetterItem = {
                            ...item,
                            retryCount: newCount,
                            lastFailedAt: failedAt,
                            failureReason: err instanceof Error ? err.message : String(err),
                        };
                        await store.dequeueOfflineItem(item.localId);
                        await store.addDeadLetterItem(deadItem);
                        Sentry.captureException(err, {
                            tags: { feature: 'offline-sync', outcome: 'dead-letter' },
                            extra: { itemType: item.type, localId: item.localId, attempts: newCount },
                        });
                        console.error(
                            `[useOfflineSync] Item ${item.localId} moved to dead-letter after ${newCount} attempts:`,
                            err,
                        );
                    } else {
                        await store.updateOfflineItemRetry(item.localId, newCount, failedAt);
                        console.warn(
                            `[useOfflineSync] Replay failed for ${item.localId} (attempt ${newCount}/${OFFLINE_MAX_RETRIES}):`,
                            err,
                        );
                    }
                }
            }
        } finally {
            isReplaying.current = false;
            useConnectionStore.getState().setSyncing(false);
        }
    }, []);

    // Trigger on connectivity/queue changes (immediate reaction to reconnect
    // and to freshly enqueued items).
    useEffect(() => {
        if (!networkOnline || offlineQueue.length === 0) return;
        void runReplay();
    }, [networkOnline, offlineQueue, runReplay]);

    // Heartbeat: retries failed-but-not-dead items on stable connections.
    useEffect(() => {
        const interval = setInterval(() => {
            if (
                useConnectionStore.getState().networkOnline &&
                useTripStore.getState().offlineQueue.length > 0
            ) {
                void runReplay();
            }
        }, HEARTBEAT_MS);
        return () => clearInterval(interval);
    }, [runReplay]);
}

// ─── Replay dispatcher ────────────────────────────────────────────────────────

async function replayItem(item: OfflineQueueItem): Promise<void> {
    const expenseStore = useExpenseStore.getState();

    if (item.type === 'ADD_EXPENSE') {
        const { payload, localId, splits } = item;
        const { expense, splits: confirmedSplits } = await addExpenseWithSplits(
            {
                tripId: payload.tripId,
                paidByMember: payload.paidByMember,
                title: payload.title,
                category: payload.category,
                amountMoney: payload.amountMoney,
            },
            // Use the splits stored at queue-time — NEVER pass []
            { splits },
        );
        // Swap optimistic local row for the confirmed server row
        expenseStore.confirmExpense(payload.tripId, localId, expense);
        expenseStore.setSplits(expense.id, confirmedSplits);
        // Local cache: drop the optimistic row, store the confirmed one.
        removeCachedExpense(localId);
        cacheExpenseWithSplits(payload.tripId, expense, confirmedSplits);
        return;
    }

    if (item.type === 'EDIT_EXPENSE') {
        await editExpense(item.payload);
        return;
    }

    if (item.type === 'DELETE_EXPENSE') {
        await deleteExpense(item.payload.expenseId);
        expenseStore.removeExpense(item.payload.tripId, item.payload.expenseId);
        removeCachedExpense(item.payload.expenseId);
        return;
    }

    if (item.type === 'SETTLE_PAIR') {
        const { tripId, memberAId, memberBId, settled } = item.payload;
        const changedRows = await settlePairBetweenMembers(tripId, memberAId, memberBId, settled);
        // Server truth overrides the optimistic flip made at enqueue time —
        // including the concurrent-settle case where changedRows is empty.
        expenseStore.applyServerSplits(changedRows);
        cacheSplits(tripId, changedRows);
        return;
    }

    // TypeScript exhaustiveness guard — never reached at runtime
    const _exhaustive: never = item;
    throw new Error(`[useOfflineSync] Unknown queue item type: ${(_exhaustive as OfflineQueueItem).type}`);
}