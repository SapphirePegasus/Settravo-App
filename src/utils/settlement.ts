/**
 * settlement.ts
 *
 * Pure client-side settlement calculator — the single source of truth for
 * all balance math in the app. Never stored in the database; always computed
 * on demand from the current expense + split state.
 *
 * ── Phase-2 rewrite: pairwise ledger replaces greedy global netting ─────────
 *
 * Why the old algorithm was wrong for this product:
 *   Greedy debtor/creditor matching minimises the NUMBER of transfers, but
 *   invents transfers between people who owe each other nothing (A shown
 *   paying C when A's actual debts are to B). "Mark as paid" then flips
 *   is_settled on split rows that don't correspond to the displayed amount —
 *   the root cause of every settle inconsistency.
 *
 * The pairwise model:
 *   1. Only UNSETTLED splits participate. A split where the member IS the
 *      payer (self-share) never creates debt.
 *   2. debt[from→to] = Σ share_money of unsettled splits where
 *      split.member = from and expense.paid_by = to.
 *   3. Reciprocal debts between the same two people are netted into one
 *      transfer (A owes B ₹300, B owes A ₹100 → A pays B ₹200).
 *   4. Nothing else is merged. Every displayed transfer maps exactly onto
 *      real split rows, so settling it (settravo_settle_pair flips BOTH
 *      directions between the pair) zeroes exactly that card.
 *
 * Trade-off accepted deliberately: pairwise can show more transfers than
 * greedy netting. Every one of them is truthful and individually settleable —
 * the correct property for a money app.
 *
 * All arithmetic is integer paise. No floating point anywhere.
 */

import type { Expense, Member, Settlement, Split } from '../types/domain';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A historical, already-settled direction (gross, not netted). */
export interface SettledPair {
    key: string;
    fromMemberId: string;
    toMemberId: string;
    fromMemberName: string;
    toMemberName: string;
    amountMoney: number;
}

// ─── Internal: pairwise ledger builder ────────────────────────────────────────

/**
 * Build a directed debt ledger from splits.
 *
 * @param settledFilter  'unsettled' → pending debts · 'settled' → history
 * @returns Map keyed `${fromId}|${toId}` → total paise owed in that direction
 */
function buildPairLedger(
    expenses: Expense[],
    splits: Split[],
    settledFilter: 'unsettled' | 'settled',
): Map<string, number> {
    const payerByExpense = new Map<string, string>(
        expenses.map((e) => [e.id, e.paidByMember]),
    );

    const ledger = new Map<string, number>();
    const wantSettled = settledFilter === 'settled';

    for (const split of splits) {
        if (split.isSettled !== wantSettled) continue;
        if (split.shareMoney <= 0) continue;

        const payer = payerByExpense.get(split.expenseId);
        if (!payer) continue;                 // split whose expense isn't loaded — skip
        if (split.memberId === payer) continue; // self-share creates no debt

        const key = `${split.memberId}|${payer}`;
        ledger.set(key, (ledger.get(key) ?? 0) + split.shareMoney);
    }

    return ledger;
}

function displayName(members: Map<string, string>, id: string): string {
    return members.get(id) ?? `(unknown ${id.slice(0, 6)})`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pending transfers for a trip.
 *
 * Same signature as before — existing call sites (settle screen, trip
 * dashboard summary) keep compiling. The math is now: unsettled splits only,
 * pairwise, with reciprocal netting, deterministic ordering.
 */
export function calculateSettlements(
    expenses: Expense[],
    splits: Split[],
    members: Member[],
): Settlement[] {
    if (expenses.length === 0 || splits.length === 0) return [];

    const nameMap = new Map<string, string>(members.map((m) => [m.id, m.displayName]));
    const ledger = buildPairLedger(expenses, splits, 'unsettled');

    const settlements: Settlement[] = [];
    const consumed = new Set<string>();

    for (const [key, amount] of ledger.entries()) {
        if (consumed.has(key)) continue;

        const [fromId, toId] = key.split('|');
        const reverseKey = `${toId}|${fromId}`;
        const reverseAmount = ledger.get(reverseKey) ?? 0;

        consumed.add(key);
        consumed.add(reverseKey);

        const net = amount - reverseAmount;
        if (net === 0) continue;

        const [debtor, creditor, value] =
            net > 0 ? [fromId, toId, net] : [toId, fromId, -net];

        settlements.push({
            fromMemberId: debtor,
            fromMemberName: displayName(nameMap, debtor),
            toMemberId: creditor,
            toMemberName: displayName(nameMap, creditor),
            amountMoney: value,
        });
    }

    // Deterministic order: largest first, then alphabetically — stable UI.
    settlements.sort(
        (a, b) =>
            b.amountMoney - a.amountMoney ||
            a.fromMemberName.localeCompare(b.fromMemberName) ||
            a.toMemberName.localeCompare(b.toMemberName),
    );

    return settlements;
}

/**
 * Settled history: gross totals per direction ("Priya paid Alex ₹450"),
 * derived exclusively from is_settled splits. Not netted — history should
 * reflect what actually happened, not an equivalent minimum.
 */
export function calculateSettledHistory(
    expenses: Expense[],
    splits: Split[],
    members: Member[],
): SettledPair[] {
    if (expenses.length === 0 || splits.length === 0) return [];

    const nameMap = new Map<string, string>(members.map((m) => [m.id, m.displayName]));
    const ledger = buildPairLedger(expenses, splits, 'settled');

    const result: SettledPair[] = [];
    for (const [key, amount] of ledger.entries()) {
        if (amount <= 0) continue;
        const [fromId, toId] = key.split('|');
        result.push({
            key,
            fromMemberId: fromId,
            toMemberId: toId,
            fromMemberName: displayName(nameMap, fromId),
            toMemberName: displayName(nameMap, toId),
            amountMoney: amount,
        });
    }

    result.sort(
        (a, b) =>
            b.amountMoney - a.amountMoney ||
            a.fromMemberName.localeCompare(b.fromMemberName),
    );

    return result;
}

/**
 * Invariant check used by the test suite:
 * total pending debt in the pairwise ledger must equal the netted total —
 * netting reciprocal pairs must never create or destroy money.
 */
export function pendingLedgerTotals(
    expenses: Expense[],
    splits: Split[],
): { grossDebt: number; nettedDebt: number } {
    const ledger = buildPairLedger(expenses, splits, 'unsettled');

    let grossDebt = 0;
    for (const amount of ledger.values()) grossDebt += amount;

    let nettedDebt = 0;
    const consumed = new Set<string>();
    for (const [key, amount] of ledger.entries()) {
        if (consumed.has(key)) continue;
        const [fromId, toId] = key.split('|');
        const reverseKey = `${toId}|${fromId}`;
        consumed.add(key);
        consumed.add(reverseKey);
        nettedDebt += Math.abs(amount - (ledger.get(reverseKey) ?? 0));
    }

    return { grossDebt, nettedDebt };
}

/**
 * Verify that expense totals equal split totals (money is conserved).
 * Call this in tests, not in production code.
 */
export function assertBalancedBooks(
    expenses: Expense[],
    splits: Split[],
): void {
    let totalPaid = 0;
    let totalOwed = 0;

    for (const e of expenses) totalPaid += e.amountMoney;
    for (const s of splits) totalOwed += s.shareMoney;

    if (totalPaid !== totalOwed) {
        throw new Error(
            `[settlement] Books don't balance: paid=${totalPaid} owed=${totalOwed} diff=${totalPaid - totalOwed}`,
        );
    }
}