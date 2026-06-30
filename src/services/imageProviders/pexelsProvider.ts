/**
 * src/services/imageProviders/pexelsProvider.ts
 *
 * Pexels implementation of ImageProvider.
 * Docs: https://www.pexels.com/api/documentation/
 *
 * Not active by default — see index.ts to switch.
 * Requires EXPO_PUBLIC_PEXELS_API_KEY (free, instant signup at pexels.com/api).
 * Rate limit: 200 requests/hour on the free tier.
 *
 * This file exists to prove the provider-swap pattern works end-to-end,
 * not because Pexels is currently in use. Activating it is a one-line
 * change in index.ts plus setting the env var — no other file changes.
 */

import type { ImageProvider, ImageSearchOptions, StockImageResult } from './ImageProvider';

const PEXELS_ENDPOINT = 'https://api.pexels.com/v1/search';

interface PexelsPhoto {
    src: { medium: string; large: string };
    photographer: string;
    url: string;
}

interface PexelsResponse {
    photos: PexelsPhoto[];
}

function mapPhoto(photo: PexelsPhoto): StockImageResult {
    return {
        previewUrl: photo.src.medium,
        fullUrl: photo.src.large,
        attribution: `Photo by ${photo.photographer} on Pexels`,
        sourceUrl: photo.url,
    };
}

export const pexelsProvider: ImageProvider = {
    name: 'Pexels',

    async search({ query, page = 1, perPage = 12 }: ImageSearchOptions): Promise<StockImageResult[]> {
        const apiKey = process.env.EXPO_PUBLIC_PEXELS_API_KEY;

        if (!apiKey) {
            throw new Error(
                '[pexelsProvider] EXPO_PUBLIC_PEXELS_API_KEY is not set. ' +
                'Get a free key at https://www.pexels.com/api/ and add it to .env.local',
            );
        }

        const params = new URLSearchParams({
            query,
            per_page: String(Math.min(Math.max(perPage, 1), 80)), // Pexels max is 80
            page: String(Math.max(page, 1)),
            orientation: 'landscape',
        });

        const response = await fetch(`${PEXELS_ENDPOINT}?${params.toString()}`, {
            headers: { Authorization: apiKey },
        });

        if (!response.ok) {
            throw new Error(`[pexelsProvider] Request failed: ${response.status} ${response.statusText}`);
        }

        const data: PexelsResponse = await response.json();
        return data.photos.map(mapPhoto);
    },
};