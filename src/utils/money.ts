/**
 * money.ts
 *
 * All money in this app is stored and computed as integer paise.
 * These helpers handle the only two conversions that exist:
 *   - Display: paise → formatted ₹ string (view layer only)
 *   - Input: user-typed rupee string → paise (before Zod validation)
 *
 * NEVER use floating-point arithmetic for money.
 * NEVER store rupees. Only paise (integers) go to Supabase.
 */

/**
 * Format paise as a human-readable rupee string.
 *
 * @example
 *   formatRupees(10050) // "₹100.50"
 *   formatRupees(10000) // "₹100"
 *   formatRupees(50)    // "₹0.50"
 */
export function formatRupees(paise: number): string {
    // Use integer arithmetic — no floating point.
    const rupees = Math.floor(paise / 100);
    const paiseRemainder = paise % 100;

    if (paiseRemainder === 0) {
        return `₹${rupees.toLocaleString('en-IN')}`;
    }

    const paiseStr = paiseRemainder.toString().padStart(2, '0');
    return `₹${rupees.toLocaleString('en-IN')}.${paiseStr}`;
}

/**
 * Parse a user-typed rupee amount string into integer paise.
 * Accepts "100", "100.50", "100.5".
 * Rejects anything with more than 2 decimal places.
 *
 * Returns null if the input is not a valid rupee amount.
 * The caller should then show a validation error — do NOT default to 0.
 *
 * @example
 *   parseRupeesToPaise("100")    // 10000
 *   parseRupeesToPaise("100.50") // 10050
 *   parseRupeesToPaise("100.5")  // 10050
 *   parseRupeesToPaise("abc")    // null
 *   parseRupeesToPaise("100.555")// null (too many decimals)
 */
export function parseRupeesToPaise(input: string): number | null {
    const trimmed = input.trim();

    // Only digits and at most one decimal point
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
        return null;
    }

    const [rupeePart, paisePart = '0'] = trimmed.split('.');

    // Pad paise part to 2 digits
    const paiseStr = paisePart.padEnd(2, '0');

    const rupees = parseInt(rupeePart, 10);
    const paiseValue = parseInt(paiseStr, 10);

    if (isNaN(rupees) || isNaN(paiseValue)) {
        return null;
    }

    return rupees * 100 + paiseValue;
}

/**
 * Distribute totalPaise evenly across N members, placing any rounding
 * remainder on the first member (the payer, by convention).
 *
 * This is the only place integer division rounding is handled.
 * The result always sums exactly to totalPaise.
 *
 * @example
 *   splitEvenly(1001, 3) // [334, 333, 333] — sums to 1000... wait:
 *   // 334 + 333 + 333 = 1000 — off by 1. Let's check:
 *   // Actually: floor(1001/3) = 333, remainder = 2
 *   // → [333+2, 333, 333] = [335, 333, 333] = 1001 ✓
 */
export function splitEvenly(totalPaise: number, memberCount: number): number[] {
    if (memberCount <= 0) {
        throw new Error('memberCount must be greater than zero');
    }

    const baseShare = Math.floor(totalPaise / memberCount);
    const remainder = totalPaise % memberCount;

    return Array.from({ length: memberCount }, (_, i) =>
        i === 0 ? baseShare + remainder : baseShare,
    );
}