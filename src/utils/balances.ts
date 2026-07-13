/**
 * balances.ts
 *
 * Cross-trip "you owe / you're owed / total spent" — the single source of
 * truth for the numbers shown on the Dashboard stat cards and the Statistics
 * balance card.
 *
 * Why this file exists (bug fix):
 *   The Dashboard previously computed these with an ad-hoc inline loop that
 *   (a) compared split member-IDs against the auth uid — different ID
 *   spaces, so matches were mostly zero; (b) ignored other members'
 *   is_settled state when the user was the payer; and (c) did no reciprocal
 *   netting. Statistics had already been fixed to use the tested pairwise
 *   engine (calculateSettlements). This module extracts that computation so
 *   BOTH screens call the same code — one engine, one truth. The screens can
 *   no longer drift apart, because there is nothing left to drift.
 *
 * Design rules:
 *  - Pure functions only. No store imports, no hooks, no I/O — trivially
 *    unit-testable and safe to call inside useMemo.
 *  - All arithmetic is integer paise (matching settlement.ts).
 *  - Identity: splits and expenses reference TRIP MEMBER ids, never the auth
 *    uid. buildMyMemberIdMap resolves "who am I in this trip" via
 *    member.deviceId === deviceUser.id, exactly as useStatisticsData does.
 */

import type { Expense, Member, Split, Trip } from '../types/domain';
import { calculateSettlements } from './settlement';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MyBalances {
    /** Paise other people currently owe me, netted pairwise, across all trips. */
    owedToMe: number;
    /** Paise I currently owe other people, netted pairwise, across all trips. */
    iOwe: number;
    /** Paise spent in total (all expenses, all trips, all time). */
    totalSpent: number;
}

// ─── Identity ─────────────────────────────────────────────────────────────────

/**
 * tripId → my member-id in that trip.
 *
 * Splits/expenses reference member IDs, never the auth uid. A trip where the
 * user has no member row (shouldn't happen for joined trips, but data can be
 * partial offline) is simply absent from the map — balance math skips it
 * rather than producing wrong numbers.
 */
export function buildMyMemberIdMap(
    trips: readonly Pick<Trip, 'id'>[],
    membersByTrip: Readonly<Record<string, Member[]>>,
    deviceUserId: string | null | undefined,
): Map<string, string> {
    const map = new Map<string, string>();
    if (!deviceUserId) return map;
    for (const trip of trips) {
        const mine = (membersByTrip[trip.id] ?? []).find(
            (m) => m.deviceId === deviceUserId,
        );
        if (mine) map.set(trip.id, mine.id);
    }
    return map;
}

// ─── Balances ─────────────────────────────────────────────────────────────────

/**
 * Compute my cross-trip balances from store-shaped inputs.
 *
 * Per trip, this runs the SAME pairwise engine as the Settle screen and the
 * Statistics balance card (calculateSettlements: unsettled splits only,
 * pairwise ledger, reciprocal netting) and sums the transfers that involve
 * my member-id in that trip.
 *
 * totalSpent is intentionally unconditional: it sums every expense of every
 * trip, including trips where my member row hasn't loaded yet — spend is a
 * property of the trip, not of my identity in it.
 *
 * Balances are NOT time-filtered: a debt exists until settled, regardless of
 * when the expense happened (same rule Statistics documents for its balance
 * card — filtering would contradict the Settle screen).
 */
export function computeMyBalances(
    trips: readonly Pick<Trip, 'id'>[],
    myMemberIdByTrip: ReadonlyMap<string, string>,
    expensesByTrip: Readonly<Record<string, Expense[]>>,
    splitsByExpense: Readonly<Record<string, Split[]>>,
    membersByTrip: Readonly<Record<string, Member[]>>,
): MyBalances {
    let owedToMe = 0;
    let iOwe = 0;
    let totalSpent = 0;

    for (const trip of trips) {
        const expenses: Expense[] = expensesByTrip[trip.id] ?? [];
        if (expenses.length === 0) continue;

        for (const exp of expenses) totalSpent += exp.amountMoney;

        const myMemberId = myMemberIdByTrip.get(trip.id);
        if (!myMemberId) continue; // spend counted; balances need identity

        const flatSplits: Split[] = [];
        for (const exp of expenses) {
            for (const sp of splitsByExpense[exp.id] ?? []) flatSplits.push(sp);
        }

        const pending = calculateSettlements(
            expenses,
            flatSplits,
            membersByTrip[trip.id] ?? [],
        );
        for (const s of pending) {
            if (s.toMemberId === myMemberId) owedToMe += s.amountMoney;
            else if (s.fromMemberId === myMemberId) iOwe += s.amountMoney;
        }
    }

    return { owedToMe, iOwe, totalSpent };
}