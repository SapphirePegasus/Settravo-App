/**
 * AppError.ts
 *
 * Typed application error class. All service layer errors are thrown as
 * AppError so the UI can distinguish error types and show contextual messages
 * rather than a single generic alert for every failure.
 *
 * Usage in services:
 *   throw new AppError('FORBIDDEN', 'You are not a member of this trip.');
 *
 * Usage in UI:
 *   catch (err) {
 *     if (err instanceof AppError && err.code === 'FORBIDDEN') { ... }
 *   }
 */

export type AppErrorCode =
    | 'NETWORK'      // No internet / request timed out
    | 'AUTH'         // 401 — session expired, needs re-auth
    | 'FORBIDDEN'    // 403 — RLS policy rejected the request
    | 'NOT_FOUND'    // 404 — trip or expense was deleted
    | 'VALIDATION'   // Zod schema parse failure
    | 'CONFLICT'     // Duplicate member, already settled, etc.
    | 'SERVER'       // 5xx from Supabase or Edge Function
    | 'UNKNOWN';     // Catch-all for unclassified errors

/** Human-readable default messages per error code, used as fallback in UI. */
export const APP_ERROR_MESSAGES: Record<AppErrorCode, string> = {
    NETWORK: 'No internet connection. Changes will sync when you\'re back online.',
    AUTH: 'Your session has expired. Please restart the app.',
    FORBIDDEN: 'You don\'t have permission to do that. The trip may have been deleted.',
    NOT_FOUND: 'This item no longer exists.',
    VALIDATION: 'Some information is invalid. Please check your inputs.',
    CONFLICT: 'This action conflicts with existing data.',
    SERVER: 'A server error occurred. Please try again.',
    UNKNOWN: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
    public readonly code: AppErrorCode;
    public readonly context?: unknown;

    constructor(code: AppErrorCode, message: string, context?: unknown) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.context = context;
        // Maintains proper prototype chain in transpiled ES5
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /** Returns the user-facing message, falling back to the default for this code. */
    get userMessage(): string {
        return this.message || APP_ERROR_MESSAGES[this.code];
    }
}

/**
 * Map a Supabase PostgrestError code to an AppErrorCode.
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function classifySupabaseError(code: string | undefined, message: string): AppError {
    if (!code) return new AppError('UNKNOWN', message);

    // HTTP-level codes from Supabase PostgREST
    if (code === 'PGRST301' || message.includes('JWT')) {
        return new AppError('AUTH', message);
    }
    if (code === '42501' || code === 'PGRST116') {
        // insufficient_privilege or row-level security violation
        return new AppError('FORBIDDEN', message);
    }
    if (code === 'PGRST204') {
        return new AppError('NOT_FOUND', message);
    }
    if (code.startsWith('23')) {
        // Class 23 = integrity constraint violation (unique, FK, check)
        return new AppError('CONFLICT', message);
    }

    return new AppError('UNKNOWN', message);
}