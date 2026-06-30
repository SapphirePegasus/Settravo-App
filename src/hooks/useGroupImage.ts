/**
 * src/hooks/useGroupImage.ts
 *
 * Fetches a cover image suggestion for a group based on its name.
 * Provider-agnostic — works with whichever provider is wired in
 * src/services/imageProviders/index.ts. Screens never import a provider
 * directly, only this hook.
 *
 * Flow:
 *   1. Caller passes the raw group name (debounced upstream — see create.tsx).
 *   2. extractImageQuery() pulls a place name or cleaned keyword set.
 *   3. Query is checked against the vulgar word blocklist; blocked queries
 *      silently fall back to "travel friends" rather than erroring.
 *   4. activeImageProvider.search() is called.
 *   5. First result is returned as the suggestion; shuffle() requests the
 *      next page for a different image with the same query.
 *
 * State exposed: result, isLoading, error (error is provider/network only —
 * "no results for this query" is NOT an error, it just returns null result).
 */

import { useCallback, useMemo, useState } from 'react';
import { activeImageProvider, type StockImageResult } from '@/services/imageProviders';
import { extractImageQuery } from '@/config/imageSearch';
import blockedWords from '@/config/vulgarWords.json';

const FALLBACK_QUERY = 'travel friends';
const blockedSet = new Set<string>(blockedWords as string[]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if any blocked word appears as a whole word in the query. */
function containsBlockedWord(query: string): boolean {
    const tokens = query.toLowerCase().split(/\s+/);
    return tokens.some((t) => blockedSet.has(t));
}

function resolveQuery(groupName: string): string {
    const extracted = extractImageQuery(groupName);
    return containsBlockedWord(extracted) ? FALLBACK_QUERY : extracted;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseGroupImageReturn {
    /** Currently suggested image, or null if nothing fetched/found yet */
    result: StockImageResult | null;
    /** True while a search request is in flight */
    isLoading: boolean;
    /** Set only on genuine provider/network failures, not "no results" */
    error: string | null;
    /** Fetch a fresh suggestion for the given group name */
    fetchForName: (groupName: string) => Promise<void>;
    /** Request a different image for the same query (cycles through pages) */
    shuffle: () => Promise<void>;
    /** Clear the current suggestion (e.g. user picked "upload my own" instead) */
    clear: () => void;
}

export function useGroupImage(): UseGroupImageReturn {
    const [result, setResult] = useState<StockImageResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastQuery, setLastQuery] = useState<string>(FALLBACK_QUERY);
    const [page, setPage] = useState(1);

    const runSearch = useCallback(async (query: string, requestedPage: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const results = await activeImageProvider.search({ query, page: requestedPage, perPage: 12 });
            setResult(results[0] ?? null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not fetch an image suggestion.');
            setResult(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchForName = useCallback(async (groupName: string) => {
        const query = resolveQuery(groupName);
        setLastQuery(query);
        setPage(1);
        await runSearch(query, 1);
    }, [runSearch]);

    const shuffle = useCallback(async () => {
        const nextPage = page + 1;
        setPage(nextPage);
        await runSearch(lastQuery, nextPage);
    }, [runSearch, lastQuery, page]);

    const clear = useCallback(() => {
        setResult(null);
        setError(null);
    }, []);

    // Memoized return — same pattern as useThemeMode.ts / useAccentColor.ts.
    // Prevents this hook from being the next "Maximum update depth exceeded"
    // source if a future consumer ever puts the whole returned object (rather
    // than individual fields) into a useEffect/useMemo dependency array.
    return useMemo<UseGroupImageReturn>(
        () => ({ result, isLoading, error, fetchForName, shuffle, clear }),
        [result, isLoading, error, fetchForName, shuffle, clear],
    );
}