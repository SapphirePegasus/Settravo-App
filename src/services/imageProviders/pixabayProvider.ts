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
    /** Public Pixabay thumbnail (≤150 px wide). No hotlink protection — safe
     *  to use directly as an Image source in React Native. */
    previewURL: string;
    /** CDN-resized medium image (≤640 px). May be blocked by geo-variant
     *  hotlink protection when used as an Image source without a browser
     *  Referer/session. Use ONLY via a controlled fetch() call — never as a
     *  direct Image source URI in the app. */
    webformatURL: string;
    /** Original resolution. Requires user login on Pixabay to download. */
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
        // previewURL: the Pixabay public thumbnail CDN, no auth requirements.
        // Always safe to pass as <Image source={{ uri }} /> in React Native.
        previewUrl: hit.previewURL,
        // webformatURL: used ONLY inside tripImageService.downloadAndUploadStockImage()
        // via a controlled fetch() with proper User-Agent. Never set directly
        // as an Image component source — intermittently blocked by Pixabay CDN
        // hotlink guards that check browser Referer headers.
        fullUrl: hit.webformatURL,
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