/**
 * useOfflineSync.ts
 *
 * Watches network connectivity and replays the offline expense queue
 * when the device comes back online.
 *
 * Mount ONCE in the root _layout.tsx — never in individual screens.
 * The queue is global (tripStore) and a per-screen instance creates
 * a race condition where multiple instances replay the same items concurrently.
 *
 * Retry policy:
 *  - Each item tracks retryCount (starts at 0).
 *  - On failure: retryCount is incremented and the item stays in the queue.
 *  - After OFFLINE_MAX_RETRIES failures: item is moved to dead-letter queue
 *    and removed from the live queue, unblocking subsequent items.
 *
 * Splits:
 *  - ADD_EXPENSE items carry a `splits` array (fixed from MVP placeholder).
 *  - Replaying with splits: [] caused settlement data loss — this is now fixed.
 */

import { useEffect, useRef } from 'react';
import {
    addExpenseWithSplits,
    deleteExpense,
    editExpense,
} from '../services/expenseService';
import { useConnectionStore } from '../stores/connectionStore';
import { useExpenseStore } from '../stores/expenseStore';
import { useTripStore } from '../stores/tripStore';
import type { DeadLetterItem, Expense, OfflineQueueItem } from '../types/domain';
import { OFFLINE_MAX_RETRIES } from '../types/domain';

export function useOfflineSync(): void {
    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const offlineQueue = useTripStore((s) => s.offlineQueue);
    const dequeueOfflineItem = useTripStore((s) => s.dequeueOfflineItem);
    const updateOfflineItemRetry = useTripStore((s) => s.updateOfflineItemRetry);
    const addDeadLetterItem = useTripStore((s) => s.addDeadLetterItem);
    const confirmExpense = useExpenseStore((s) => s.confirmExpense);
    const setSplits = useExpenseStore((s) => s.setSplits);
    const removeExpense = useExpenseStore((s) => s.removeExpense);

    // Ref prevents concurrent replay runs within the same mounted instance
    const isReplaying = useRef(false);

    useEffect(() => {
        if (!networkOnline || offlineQueue.length === 0 || isReplaying.current) {
            return;
        }

        async function replay(): Promise<void> {
            isReplaying.current = true;

            // Snapshot at replay start — items added during replay are picked
            // up on the next online event, not mixed into this run.
            const itemsToReplay = [...offlineQueue];

            for (const item of itemsToReplay) {
                try {
                    await replayItem(item, confirmExpense, setSplits, removeExpense);
                    await dequeueOfflineItem(item.localId);
                } catch (err) {
                    const newCount = (item.retryCount ?? 0) + 1;
                    const failedAt = new Date().toISOString();

                    if (newCount >= OFFLINE_MAX_RETRIES) {
                        // Permanently failed — move to dead-letter so the queue
                        // is not blocked forever by this item.
                        const deadItem: DeadLetterItem = {
                            ...item,
                            retryCount: newCount,
                            lastFailedAt: failedAt,
                            failureReason: err instanceof Error ? err.message : String(err),
                        };
                        await dequeueOfflineItem(item.localId);
                        await addDeadLetterItem(deadItem);
                        console.error(
                            `[useOfflineSync] Item ${item.localId} moved to dead-letter after ${newCount} attempts:`,
                            err,
                        );
                    } else {
                        await updateOfflineItemRetry(item.localId, newCount, failedAt);
                        console.warn(
                            `[useOfflineSync] Replay failed for ${item.localId} (attempt ${newCount}/${OFFLINE_MAX_RETRIES}):`,
                            err,
                        );
                    }
                }
            }

            isReplaying.current = false;
        }

        replay();
    }, [
        networkOnline,
        offlineQueue,
        dequeueOfflineItem,
        updateOfflineItemRetry,
        addDeadLetterItem,
        confirmExpense,
        setSplits,
        removeExpense,
    ]);
}

// ─── Replay dispatcher ────────────────────────────────────────────────────────

async function replayItem(
    item: OfflineQueueItem,
    confirmExpense: (tripId: string, localId: string, confirmed: Expense) => void,
    setSplits: (expenseId: string, splits: import('../types/domain').Split[]) => void,
    removeExpense: (tripId: string, expenseId: string) => void,
): Promise<void> {
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
        confirmExpense(payload.tripId, localId, expense);
        // Hydrate the confirmed splits into the store so settlement math is correct
        setSplits(expense.id, confirmedSplits);
        return;
    }

    if (item.type === 'EDIT_EXPENSE') {
        await editExpense(item.payload);
        return;
    }

    if (item.type === 'DELETE_EXPENSE') {
        await deleteExpense(item.payload.expenseId);
        removeExpense(item.payload.tripId, item.payload.expenseId);
        return;
    }

    // TypeScript exhaustiveness guard — never reached at runtime
    const _exhaustive: never = item;
    throw new Error(`[useOfflineSync] Unknown queue item type: ${(_exhaustive as OfflineQueueItem).type}`);
}