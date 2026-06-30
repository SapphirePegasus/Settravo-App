/**
 * src/services/imageProviders/ImageProvider.ts
 *
 * Provider-agnostic stock image search interface.
 *
 * ARCHITECTURE: This is the ONLY contract the rest of the app depends on.
 * useGroupImage.ts (the hook screens call) only ever imports
 * `activeImageProvider` from index.ts — never a concrete provider directly.
 *
 * To switch from Pixabay to Pexels, Unsplash, or any other source:
 *   1. Implement this interface in a new file (e.g. pexelsProvider.ts)
 *   2. Change ONE line in index.ts: export the new provider as activeImageProvider
 *   3. Set the new API key env var
 * No screen, hook, or component changes required.
 */

export interface StockImageResult {
    /** Direct URL to a small/preview-resolution image (fast load, list/grid use) */
    previewUrl: string;
    /** Direct URL to a larger image suitable as a cover (full screen, hero use) */
    fullUrl: string;
    /** Attribution string, if the provider's terms require display (most free tiers do) */
    attribution?: string;
    /** Original photographer/source page, for attribution link-through */
    sourceUrl?: string;
}

export interface ImageSearchOptions {
    /** Search query (already passed through extractImageQuery + blocklist check) */
    query: string;
    /** Page or offset, used by shuffle() to request a different result for the same query */
    page?: number;
    /** Max results to fetch in one call (most providers default to a reasonable page size) */
    perPage?: number;
}

export interface ImageProvider {
    /** Human-readable name, used in error messages and the Settings/About screen */
    readonly name: string;

    /**
     * Search for images matching a query.
     * MUST NOT throw on "no results" — return an empty array instead.
     * MUST throw on actual failures (network error, invalid key, rate limit)
     * so the caller can distinguish "nothing found" from "something broke".
     */
    search(options: ImageSearchOptions): Promise<StockImageResult[]>;
}