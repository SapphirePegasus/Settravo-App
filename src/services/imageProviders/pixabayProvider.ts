/**
 * src/services/imageProviders/pixabayProvider.ts
 *
 * Pixabay implementation of ImageProvider.
 * Docs: https://pixabay.com/api/docs/
 *
 * Requires a free API key from https://pixabay.com/api/docs/ — sign up,
 * the key is shown on that page immediately, no approval wait.
 * Without a key, Pixabay's API rejects the request entirely (no anonymous
 * tier), so EXPO_PUBLIC_PIXABAY_API_KEY is required for this provider to work.
 *
 * Rate limit: 100 requests/60s on the free tier — more than sufficient for
 * a debounced "type group name → fetch cover image" flow.
 */

import type { ImageProvider, ImageSearchOptions, StockImageResult } from './ImageProvider';

const PIXABAY_ENDPOINT = 'https://pixabay.com/api/';

interface PixabayHit {
    previewURL: string;
    webformatURL: string;
    largeImageURL: string;
    user: string;
    pageURL: string;
}

interface PixabayResponse {
    total: number;
    totalHits: number;
    hits: PixabayHit[];
}

function mapHit(hit: PixabayHit): StockImageResult {
    return {
        previewUrl: hit.webformatURL,
        fullUrl: hit.largeImageURL,
        attribution: `Image by ${hit.user} on Pixabay`,
        sourceUrl: hit.pageURL,
    };
}

export const pixabayProvider: ImageProvider = {
    name: 'Pixabay',

    async search({ query, page = 1, perPage = 12 }: ImageSearchOptions): Promise<StockImageResult[]> {
        const apiKey = process.env.EXPO_PUBLIC_PIXABAY_API_KEY;

        if (!apiKey) {
            throw new Error(
                '[pixabayProvider] EXPO_PUBLIC_PIXABAY_API_KEY is not set. ' +
                'Get a free key at https://pixabay.com/api/docs/ and add it to .env.local',
            );
        }

        const params = new URLSearchParams({
            key: apiKey,
            q: query,
            image_type: 'photo',
            safesearch: 'true',
            orientation: 'horizontal',
            per_page: String(Math.min(Math.max(perPage, 3), 200)), // Pixabay requires 3-200
            page: String(Math.max(page, 1)),
        });

        const response = await fetch(`${PIXABAY_ENDPOINT}?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`[pixabayProvider] Request failed: ${response.status} ${response.statusText}`);
        }

        const data: PixabayResponse = await response.json();
        return data.hits.map(mapHit);
    },
};