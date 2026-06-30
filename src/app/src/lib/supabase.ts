/**
 * supabase.ts
 *
 * Single Supabase client instance for the entire app.
 *
 * WebSocket transport strategy:
 *  - In React Native / browser environments: globalThis.WebSocket exists natively.
 *  - In Node.js 20 (Metro bundler, EAS build workers, SSR): no native WebSocket.
 *    We require() the `ws` package at runtime — it is already present as a
 *    transitive dependency of @supabase/realtime-js and metro, so no extra
 *    installation is needed.
 *  - We never import `ws` at the top level because that would inject it into
 *    the React Native bundle and bloat it unnecessarily.
 *
 * Session persistence:
 *  - Uses expo-sqlite's localStorage polyfill (installed by the side-effect import).
 *  - The polyfill must be imported BEFORE createClient() is called.
 *
 * Security:
 *  - The publishable key is safe to ship in the bundle. All data access
 *    is controlled by Supabase Row-Level Security policies.
 *  - autoRefreshToken: true — never manually poll getSession()/getUser().
 *    A second polling loop races the SDK's internal refresh and corrupts tokens.
 *  - detectSessionInUrl: false — required in React Native (no URL bar).
 */

import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// ─── Environment validation ───────────────────────────────────────────────────

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
        '[supabase] Missing env vars.\n' +
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        'to your .env.local file and restart the Metro bundler.',
    );
}

// ─── Auth storage ─────────────────────────────────────────────────────────────

/**
 * expo-sqlite/localStorage/install patches globalThis.localStorage.
 * The import above runs that patch before we reach this line.
 * The conditional guard is a safety net for rare environments where the
 * polyfill hasn't loaded yet (e.g. Jest without the jest-expo preset).
 */
const storage: Storage | undefined =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
        ? (globalThis as unknown as { localStorage: Storage }).localStorage
        : undefined;

// ─── WebSocket transport ──────────────────────────────────────────────────────

/**
 * Resolve the correct WebSocket constructor for the current runtime:
 *
 *  1. React Native / modern browser  → globalThis.WebSocket (always present)
 *  2. Node.js >= 22                  → globalThis.WebSocket (built-in since 22)
 *  3. Node.js 20 (Metro / EAS)       → `ws` package (transitive dep, require'd
 *                                       at runtime so it stays out of the RN bundle)
 *
 * Using `typeof require !== 'undefined'` (not `__DEV__` or platform checks)
 * because this module may load during Metro's Node.js resolver phase.
 *
 * We cast to `typeof WebSocket` because the `ws` constructor signature is
 * compatible with the browser WebSocket interface that realtime-js expects,
 * but TypeScript doesn't know that without the `@types/ws` package.
 */
function resolveWebSocket(): typeof WebSocket | undefined {
    // Native WebSocket present — React Native, modern browser, Node >= 22
    if (typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).WebSocket === 'function') {
        return (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket;
    }

    // Node.js < 22 — require `ws` without polluting the RN bundle.
    // `require` is always available in Metro's Node.js server-side context.
    if (typeof require !== 'undefined') {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const ws = require('ws') as { default?: typeof WebSocket } | typeof WebSocket;
            // `ws` exports the constructor as the default export or as the module itself
            const Ws = (ws as { default?: typeof WebSocket }).default ?? ws as unknown as typeof WebSocket;
            return Ws;
        } catch {
            // `ws` not available — Realtime will be disabled gracefully.
            // This only happens in unusual environments (e.g. bare Node without deps).
        }
    }

    return undefined;
}

const websocketImpl = resolveWebSocket();

// ─── Client ───────────────────────────────────────────────────────────────────

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
    realtime: {
        // Provide an explicit WebSocket constructor so @supabase/realtime-js
        // does not attempt its own environment detection (which throws in Node 20).
        // Casting through `never` avoids a type mismatch between the `ws` constructor
        // signature and the stricter browser WebSocket interface in @types/lib.dom.d.ts.
        transport: websocketImpl as never,
    },
});