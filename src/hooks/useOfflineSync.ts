/**
 * useOfflineSync.ts
 *
 * Watches network connectivity and replays the offline expense queue
 * when the device comes back online.
 *
 * Mount once — in the root layout or in the trip detail screen.
 * Each queued item is replayed in order. Successfully replayed items
 * are dequeued. Failed items stay in the queue for the next reconnect.
 *
 * Queue item types handled:
 *  - ADD_EXPENSE: calls addExpenseWithSplits()
 *  - EDIT_EXPENSE: calls editExpense()
 *  - DELETE_EXPENSE: calls deleteExpense()
 *
 * Idempotency note:
 *  - ADD_EXPENSE uses a localId (UUID) as the expense id in the optimistic
 *    store. On replay, the server assigns a real UUID. confirmExpense() in
 *    expenseStore swaps the localId row for the real row.
 *  - If the app crashes between queue write and dequeue, the item is replayed
 *    again on next launch. addExpenseWithSplits() is not inherently idempotent,
 *    so a duplicate may appear. For MVP this is acceptable (last-write-wins
 *    via updated_at). A full dedup solution requires server-side idempotency keys.
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
import type { OfflineQueueItem } from '../types/domain';

export function useOfflineSync() {
    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const offlineQueue = useTripStore((s) => s.offlineQueue);
    const dequeueOfflineItem = useTripStore((s) => s.dequeueOfflineItem);
    const confirmExpense = useExpenseStore((s) => s.confirmExpense);
    const removeExpense = useExpenseStore((s) => s.removeExpense);

    // Ref to prevent concurrent replay runs
    const isReplaying = useRef(false);

    useEffect(() => {
        if (!networkOnline || offlineQueue.length === 0 || isReplaying.current) {
            return;
        }

        async function replay() {
            isReplaying.current = true;
            // Snapshot the queue at replay start — new items added during replay
            // are not processed in this run (they'll be caught on the next online event).
            const itemsToReplay = [...offlineQueue];

            for (const item of itemsToReplay) {
                try {
                    await replayItem(item, confirmExpense, removeExpense);
                    await dequeueOfflineItem(item.localId);
                } catch (err) {
                    // Log but don't dequeue — item stays for next retry.
                    console.warn(`[useOfflineSync] Replay failed for ${item.localId}:`, err);
                }
            }
            isReplaying.current = false;
        }

        replay();
    }, [networkOnline, offlineQueue, dequeueOfflineItem, confirmExpense, removeExpense]);
}

async function replayItem(
    item: OfflineQueueItem,
    confirmExpense: (tripId: string, localId: string, confirmed: import('../types/domain').Expense) => void,
    removeExpense: (tripId: string, expenseId: string) => void,
): Promise<void> {
    if (item.type === 'ADD_EXPENSE') {
        const { payload, localId } = item;
        const { expense } = await addExpenseWithSplits(
            {
                tripId: payload.tripId,
                paidByMember: payload.paidByMember,
                title: payload.title,
                category: payload.category,
                amountMoney: payload.amountMoney,
            },
            // Splits are not stored in the offline queue for ADD_EXPENSE in this MVP.
            // They will be re-entered by the user. A future version should store splits
            // alongside the expense in the queue payload.
            { splits: [] },
        );
        confirmExpense(payload.tripId, localId, expense);
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
}