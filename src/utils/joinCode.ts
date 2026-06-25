/**
 * joinCode.ts
 *
 * Utilities for 6-character join codes with 30-minute TTL.
 * Codes are uppercase alphanumeric only (no 0/O or 1/I confusion).
 */

// Exclude visually ambiguous chars: 0, O, 1, I
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CODE_LENGTH = 6;
const TTL_MINUTES = 30;

/**
 * Generate a cryptographically random 6-char join code.
 * Uses Math.random only as a fallback — prefers crypto.getRandomValues.
 */
export function generateJoinCode(): string {
    const bytes = new Uint8Array(CODE_LENGTH);

    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        // Fallback for environments without Web Crypto (should not happen in RN)
        for (let i = 0; i < CODE_LENGTH; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }

    return Array.from(bytes)
        .map((b) => CHARSET[b % CHARSET.length])
        .join('');
}

/**
 * Returns the ISO timestamptz string for TTL_MINUTES from now.
 * Pass this as `join_code_expires_at` when creating or regenerating a code.
 */
export function generateExpiresAt(): string {
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);
    return expiresAt.toISOString();
}

/**
 * Returns true if the join code has expired or if expiresAt is null.
 * Always check this on the client before showing a QR code.
 * The authoritative check is also done in the Edge Function on join.
 */
export function isJoinCodeExpired(expiresAt: string | null): boolean {
    if (expiresAt === null) {
        return true;
    }
    return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Returns how many seconds remain on the join code TTL.
 * Returns 0 if already expired.
 */
export function joinCodeSecondsRemaining(expiresAt: string | null): number {
    if (expiresAt === null) {
        return 0;
    }
    const remaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, remaining);
}