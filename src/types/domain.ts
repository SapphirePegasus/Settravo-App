/**
 * domain.ts
 *
 * Hand-written domain types. These are what the rest of the app uses.
 * Services map raw Supabase DB rows → these types at the boundary.
 * Components NEVER import from supabase.ts (generated types).
 *
 * All money is integer paise. Display-only conversion happens in money.ts.
 *
 * Phase-3 additions:
 *  - DeviceUser.isProvisional: offline boot with a session but no cached
 *    profile serves a provisional identity (auth gate keeps the user inside
 *    the app instead of bouncing them to onboarding they can't complete).
 *  - SETTLE_PAIR offline queue item: settling now works offline too.
 */

// ─── Identity ────────────────────────────────────────────────────────────────

export interface DeviceUser {
    /** Supabase auth.uid() — the anonymous JWT sub. Also the PK of TravelAppUsers. */
    id: string;
    /** UUID stored in expo-secure-store. Matches auth.uid() after sign-in. */
    deviceUuid: string;
    displayName: string | null;
    avatarColor: string | null;
    createdAt: string;
    lastSeen: string;
    /**
     * True only for the in-memory identity built during an offline boot when
     * the SecureStore profile cache was missing. The user IS onboarded (a
     * session exists) — their profile just hasn't been readable yet. Never
     * persisted; replaced by the real profile as soon as connectivity returns.
     */
    isProvisional?: boolean;
}

// ─── Trip ────────────────────────────────────────────────────────────────────

export interface Trip {
    id: string;
    name: string;
    destination: string | null;
    startDate: string | null;  // ISO date string YYYY-MM-DD
    endDate: string | null;
    createdByDevice: string;   // FK → TravelAppUsers.id
    createdAt: string;
    /** URL to the trip's cover image stored in Supabase Storage. Null when not set. */
    coverImageUrl: string | null | undefined;
    /** Null when expired or never generated. 4 uppercase alphanumeric chars. */
    joinCode: string | null;
    /** ISO timestamptz. Null when code is expired or never generated. */
    joinCodeExpiresAt: string | null;
}

// ─── Member ──────────────────────────────────────────────────────────────────

export interface Member {
    id: string;
    tripId: string;
    /** Null for guest members (added by name, no device yet). */
    deviceId: string | null;
    displayName: string;
    joinedAt: string;
    /**
     * UUID token for guest web access. Null for real device members.
     * Generated when trip creator adds a member by name.
     */
    guestToken: string | null;
    /** True if this member has not yet installed the app and claimed their account. */
    isGuest: boolean;
}

// ─── Expense ─────────────────────────────────────────────────────────────────

export type ExpenseCategory = 'food' | 'transport' | 'stay' | 'misc';

export interface Expense {
    id: string;
    tripId: string;
    paidByMember: string;   // FK → TravelAppMembers.id
    title: string;
    category: ExpenseCategory | null;
    /** Integer paise. Never a float. */
    amountMoney: number;
    createdAt: string;
    updatedAt: string;
    /** True if this was created offline and not yet synced. */
    isPendingSync?: boolean;
}

// ─── Split ───────────────────────────────────────────────────────────────────

export interface Split {
    id: string;
    expenseId: string;
    memberId: string;
    /** Integer paise. */
    shareMoney: number;
    isSettled: boolean;
}

// ─── Settlement (client-only, never stored) ──────────────────────────────────

export interface Settlement {
    /** Member who owes money. */
    fromMemberId: string;
    fromMemberName: string;
    /** Member who is owed money. */
    toMemberId: string;
    toMemberName: string;
    /** Integer paise. */
    amountMoney: number;
}

// ─── Offline queue ───────────────────────────────────────────────────────────

/**
 * Base fields shared by every offline queue item.
 * retryCount starts at 0. Items exceeding OFFLINE_MAX_RETRIES are moved
 * to the dead-letter queue by useOfflineSync.
 */
type OfflineQueueBase = {
    localId: string;
    retryCount: number;
    lastFailedAt: string | null; // ISO timestamptz
};

export type OfflineQueueItem =
    | (OfflineQueueBase & {
        type: 'ADD_EXPENSE';
        payload: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;
        /** Splits MUST be stored here — replaying with [] causes data loss. */
        splits: { memberId: string; shareMoney: number }[];
    })
    | (OfflineQueueBase & {
        type: 'EDIT_EXPENSE';
        payload: Partial<Expense> & { id: string };
    })
    | (OfflineQueueBase & {
        type: 'DELETE_EXPENSE';
        payload: { expenseId: string; tripId: string };
    })
    | (OfflineQueueBase & {
        type: 'SETTLE_PAIR';
        payload: {
            tripId: string;
            memberAId: string;
            memberBId: string;
            settled: boolean;
        };
    });

/** Dead-letter item: an OfflineQueueItem that permanently failed. */
export type DeadLetterItem = OfflineQueueItem & { failureReason: string };

/** Maximum retry attempts before an item is moved to dead-letter. */
export const OFFLINE_MAX_RETRIES = 5;

// ─── Recurring bill templates (Phase 5) ──────────────────────────────────────

export type Recurrence = 'monthly' | 'weekly';

/**
 * A recurring bill definition. Expenses are lazily materialized from it
 * server-side (settravo_materialize_recurring) when the group is opened —
 * one per (template, period), guaranteed by a DB unique index.
 */
export interface ExpenseTemplate {
    id: string;
    tripId: string;
    createdByDevice: string;   // FK → TravelAppUsers.id
    paidByMember: string;      // FK → TravelAppMembers.id
    title: string;
    category: ExpenseCategory | null;
    /** Integer paise. */
    amountMoney: number;
    /** v1 always 'equal'; 'custom' reserved for premium. */
    splitMode: 'equal' | 'custom';
    recurrence: Recurrence;
    /** Monthly: day of month 1–28. Weekly: ISO weekday 1–7 (Mon=1). */
    dueDay: number;
    /** ISO date YYYY-MM-DD. Occurrences before this never materialize. */
    startDate: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * Free-tier cap: one active recurring bill per user (across their trips).
 * Enforced in the UI/service layer; Settravo Plus lifts it (later phase).
 * The server independently caps 20 active templates per trip as abuse
 * protection.
 */
export const FREE_ACTIVE_TEMPLATE_LIMIT = 1;

// ─── Connection status ───────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';