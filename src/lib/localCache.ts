/**
 * localCache.ts
 *
 * SQLite mirror of the five server entities — the foundation of offline mode.
 *
 * Before this file existed the app persisted only trip IDs and the offline
 * queue: booting offline produced empty screens. Now:
 *
 *   WRITE-THROUGH: every successful fetch (and every optimistic offline
 *   mutation) is written here.
 *   READ-THROUGH: hooks hydrate from here instantly on mount, then refresh
 *   from the network when online. Offline, the cache IS the data.
 *
 * Design rules:
 *  - Uses expo-sqlite's synchronous API (openDatabaseSync / runSync /
 *    getAllSync / withTransactionSync — SDK 55). Data volumes are small
 *    (hundreds of rows); synchronous access at hydrate time is faster and
 *    simpler than promise choreography during boot.
 *  - EVERY public function is wrapped: the cache must never crash the app.
 *    A broken cache degrades to "no cache", nothing worse. Failures are
 *    breadcrumbed to Sentry so persistent corruption is visible.
 *  - Schema versioned via PRAGMA user_version for future migrations.
 *  - clearLocalCache() wipes everything on sign-out (shared-device safety).
 *
 * This file must stay dependency-free of stores/hooks (imported BY them).
 */

import * as Sentry from '@sentry/react-native';
import * as SQLite from 'expo-sqlite';
import type { Expense, Member, Split, Trip } from '../types/domain';

const DB_NAME = 'settravo-cache.db';
const SCHEMA_VERSION = 1;

let db: SQLite.SQLiteDatabase | null = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Open + migrate the cache database. Call once, early, from the root layout.
 * Safe to call repeatedly. Returns false if SQLite is unavailable — every
 * other function silently no-ops in that state.
 */
export function initLocalCache(): boolean {
    if (db) return true;
    try {
        db = SQLite.openDatabaseSync(DB_NAME);
        db.execSync('PRAGMA journal_mode = WAL;');

        const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
        const version = row?.user_version ?? 0;

        if (version < 1) {
            db.withTransactionSync(() => {
                db!.execSync(`
                    CREATE TABLE IF NOT EXISTS trips (
                        id TEXT PRIMARY KEY NOT NULL,
                        json TEXT NOT NULL,
                        updated_at INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS members (
                        id TEXT PRIMARY KEY NOT NULL,
                        trip_id TEXT NOT NULL,
                        json TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS members_trip_idx ON members (trip_id);
                    CREATE TABLE IF NOT EXISTS expenses (
                        id TEXT PRIMARY KEY NOT NULL,
                        trip_id TEXT NOT NULL,
                        json TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS expenses_trip_idx ON expenses (trip_id);
                    CREATE TABLE IF NOT EXISTS splits (
                        id TEXT PRIMARY KEY NOT NULL,
                        expense_id TEXT NOT NULL,
                        trip_id TEXT NOT NULL,
                        json TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS splits_trip_idx ON splits (trip_id);
                `);
                db!.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
            });
        }
        return true;
    } catch (err) {
        db = null;
        Sentry.captureException(err, { tags: { feature: 'local-cache', op: 'init' } });
        console.error('[localCache] init failed — running without cache:', err);
        return false;
    }
}

function guard<T>(op: string, fallback: T, fn: (d: SQLite.SQLiteDatabase) => T): T {
    if (!db) return fallback;
    try {
        return fn(db);
    } catch (err) {
        Sentry.addBreadcrumb({
            category: 'local-cache',
            message: `${op} failed`,
            level: 'warning',
        });
        console.warn(`[localCache] ${op} failed:`, err);
        return fallback;
    }
}

// ─── Trips ────────────────────────────────────────────────────────────────────

/** Replace the full cached trip list (called after a successful fetchMyTrips). */
export function cacheTrips(trips: Trip[]): void {
    guard('cacheTrips', undefined, (d) => {
        d.withTransactionSync(() => {
            d.runSync('DELETE FROM trips;');
            const now = Date.now();
            for (const trip of trips) {
                d.runSync(
                    'INSERT OR REPLACE INTO trips (id, json, updated_at) VALUES (?, ?, ?);',
                    [trip.id, JSON.stringify(trip), now],
                );
            }
        });
    });
}

/** Upsert a single trip (create/join/edit while online). */
export function cacheTrip(trip: Trip): void {
    guard('cacheTrip', undefined, (d) => {
        d.runSync(
            'INSERT OR REPLACE INTO trips (id, json, updated_at) VALUES (?, ?, ?);',
            [trip.id, JSON.stringify(trip), Date.now()],
        );
    });
}

export function removeCachedTrip(tripId: string): void {
    guard('removeCachedTrip', undefined, (d) => {
        d.withTransactionSync(() => {
            d.runSync('DELETE FROM trips WHERE id = ?;', [tripId]);
            d.runSync('DELETE FROM members WHERE trip_id = ?;', [tripId]);
            d.runSync('DELETE FROM expenses WHERE trip_id = ?;', [tripId]);
            d.runSync('DELETE FROM splits WHERE trip_id = ?;', [tripId]);
        });
    });
}

export function readCachedTrips(): Trip[] {
    return guard('readCachedTrips', [] as Trip[], (d) => {
        const rows = d.getAllSync<{ json: string }>(
            'SELECT json FROM trips ORDER BY updated_at DESC;',
        );
        return rows.map((r) => JSON.parse(r.json) as Trip);
    });
}

// ─── Members ──────────────────────────────────────────────────────────────────

export function cacheMembers(tripId: string, members: Member[]): void {
    guard('cacheMembers', undefined, (d) => {
        d.withTransactionSync(() => {
            d.runSync('DELETE FROM members WHERE trip_id = ?;', [tripId]);
            for (const m of members) {
                d.runSync(
                    'INSERT OR REPLACE INTO members (id, trip_id, json) VALUES (?, ?, ?);',
                    [m.id, tripId, JSON.stringify(m)],
                );
            }
        });
    });
}

export function readCachedMembers(tripId: string): Member[] {
    return guard('readCachedMembers', [] as Member[], (d) => {
        const rows = d.getAllSync<{ json: string }>(
            'SELECT json FROM members WHERE trip_id = ?;',
            [tripId],
        );
        return rows.map((r) => JSON.parse(r.json) as Member);
    });
}

// ─── Expenses + splits ────────────────────────────────────────────────────────

/** Replace the cached expense+split snapshot for one trip (post-fetch). */
export function cacheTripData(tripId: string, expenses: Expense[], splits: Split[]): void {
    guard('cacheTripData', undefined, (d) => {
        d.withTransactionSync(() => {
            d.runSync('DELETE FROM expenses WHERE trip_id = ?;', [tripId]);
            d.runSync('DELETE FROM splits WHERE trip_id = ?;', [tripId]);
            for (const e of expenses) {
                d.runSync(
                    'INSERT OR REPLACE INTO expenses (id, trip_id, json) VALUES (?, ?, ?);',
                    [e.id, tripId, JSON.stringify(e)],
                );
            }
            for (const s of splits) {
                d.runSync(
                    'INSERT OR REPLACE INTO splits (id, expense_id, trip_id, json) VALUES (?, ?, ?, ?);',
                    [s.id, s.expenseId, tripId, JSON.stringify(s)],
                );
            }
        });
    });
}

/** Upsert one expense + its splits (optimistic offline add, or confirm swap). */
export function cacheExpenseWithSplits(tripId: string, expense: Expense, splits: Split[]): void {
    guard('cacheExpenseWithSplits', undefined, (d) => {
        d.withTransactionSync(() => {
            d.runSync(
                'INSERT OR REPLACE INTO expenses (id, trip_id, json) VALUES (?, ?, ?);',
                [expense.id, tripId, JSON.stringify(expense)],
            );
            d.runSync('DELETE FROM splits WHERE expense_id = ?;', [expense.id]);
            for (const s of splits) {
                d.runSync(
                    'INSERT OR REPLACE INTO splits (id, expense_id, trip_id, json) VALUES (?, ?, ?, ?);',
                    [s.id, s.expenseId, tripId, JSON.stringify(s)],
                );
            }
        });
    });
}

/** Remove one expense and its splits (delete, or optimistic-row swap). */
export function removeCachedExpense(expenseId: string): void {
    guard('removeCachedExpense', undefined, (d) => {
        d.withTransactionSync(() => {
            d.runSync('DELETE FROM expenses WHERE id = ?;', [expenseId]);
            d.runSync('DELETE FROM splits WHERE expense_id = ?;', [expenseId]);
        });
    });
}

/** Upsert split rows in place (settle results — server-returned or optimistic). */
export function cacheSplits(tripId: string, splits: Split[]): void {
    guard('cacheSplits', undefined, (d) => {
        d.withTransactionSync(() => {
            for (const s of splits) {
                d.runSync(
                    'INSERT OR REPLACE INTO splits (id, expense_id, trip_id, json) VALUES (?, ?, ?, ?);',
                    [s.id, s.expenseId, tripId, JSON.stringify(s)],
                );
            }
        });
    });
}

export function readCachedExpenses(tripId: string): Expense[] {
    return guard('readCachedExpenses', [] as Expense[], (d) => {
        const rows = d.getAllSync<{ json: string }>(
            'SELECT json FROM expenses WHERE trip_id = ?;',
            [tripId],
        );
        return rows
            .map((r) => JSON.parse(r.json) as Expense)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    });
}

export function readCachedSplits(tripId: string): Split[] {
    return guard('readCachedSplits', [] as Split[], (d) => {
        const rows = d.getAllSync<{ json: string }>(
            'SELECT json FROM splits WHERE trip_id = ?;',
            [tripId],
        );
        return rows.map((r) => JSON.parse(r.json) as Split);
    });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/** Wipe everything. Called on sign-out — never leave money data behind. */
export function clearLocalCache(): void {
    guard('clearLocalCache', undefined, (d) => {
        d.withTransactionSync(() => {
            d.runSync('DELETE FROM trips;');
            d.runSync('DELETE FROM members;');
            d.runSync('DELETE FROM expenses;');
            d.runSync('DELETE FROM splits;');
        });
    });
}