/**
 * settlement.ts
 *
 * Pure client-side settlement calculator.
 * Never stored in the database — always computed on demand from the
 * current expense + split state.
 *
 * Algorithm: greedy debtor/creditor matching (minimum number of transfers).
 *  1. Calculate net balance per member: amount paid - amount owed.
 *  2. Separate into creditors (positive balance) and debtors (negative).
 *  3. Greedily match the largest debtor to the largest creditor.
 *  4. Emit a Settlement for each match.
 *
 * All arithmetic is integer paise. No floating point anywhere.
 *
 * Correctness invariants:
 *  - sum(settlements.amountMoney) can be verified externally.
 *  - sum(all net balances) === 0 (money is conserved).
 *  - A member with zero net balance produces no settlements.
 *
 * @param expenses - All expenses for the trip
 * @param splits   - All splits for the trip (flat array across all expenses)
 * @param members  - All members (for display names in the result)
 */

import type { Expense, Member, Settlement, Split } from '../types/domain';

export function calculateSettlements(
    expenses: Expense[],
    splits: Split[],
    members: Member[],
): Settlement[] {
    if (expenses.length === 0 || splits.length === 0) return [];

    // Build a lookup: memberId → displayName
    const nameMap = new Map<string, string>(
        members.map((m) => [m.id, m.displayName]),
    );

    // Step 1: net balance per member (paise)
    // Positive = is owed money (creditor)
    // Negative = owes money (debtor)
    const balance = new Map<string, number>();

    // Add what each member paid
    for (const expense of expenses) {
        const current = balance.get(expense.paidByMember) ?? 0;
        balance.set(expense.paidByMember, current + expense.amountMoney);
    }

    // Subtract what each member owes (their split share)
    for (const split of splits) {
        const current = balance.get(split.memberId) ?? 0;
        balance.set(split.memberId, current - split.shareMoney);
    }

    // Step 2: separate into sorted creditors and debtors
    // Sort descending by absolute value so greedy matching minimises transfers.
    type BalanceEntry = { memberId: string; amount: number };

    const creditors: BalanceEntry[] = [];
    const debtors: BalanceEntry[] = [];

    for (const [memberId, amount] of balance.entries()) {
        if (amount > 0) creditors.push({ memberId, amount });
        else if (amount < 0) debtors.push({ memberId, amount: -amount }); // store as positive
    }

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    // Step 3: greedy matching
    const settlements: Settlement[] = [];
    let ci = 0;
    let di = 0;

    while (ci < creditors.length && di < debtors.length) {
        const creditor = creditors[ci];
        const debtor = debtors[di];

        const transfer = Math.min(creditor.amount, debtor.amount);

        if (transfer > 0) {
            settlements.push({
                fromMemberId: debtor.memberId,
                fromMemberName: nameMap.get(debtor.memberId) ?? `(unknown ${debtor.memberId.slice(0, 6)})`,
                toMemberId: creditor.memberId,
                toMemberName: nameMap.get(creditor.memberId) ?? `(unknown ${creditor.memberId.slice(0, 6)})`,
                amountMoney: transfer,
            });
        }

        creditor.amount -= transfer;
        debtor.amount -= transfer;

        if (creditor.amount === 0) ci++;
        if (debtor.amount === 0) di++;
    }

    return settlements;
}

/**
 * Verify that the net balances sum to exactly zero (money is conserved).
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