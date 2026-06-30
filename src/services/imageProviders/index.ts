/**
 * src/services/imageProviders/index.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONLY FILE TO EDIT WHEN SWITCHING IMAGE PROVIDERS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * To switch from Pixabay to Pexels (or any future provider):
 *   1. Change the import below from pixabayProvider to pexelsProvider
 *   2. Change the export assignment to match
 *   3. Set the new provider's API key env var (see that provider's file)
 *
 * Nothing else in the app needs to change — useGroupImage.ts and every
 * screen that uses it only ever import `activeImageProvider` from here.
 */

import { pixabayProvider } from './pixabayProvider';
// import { pexelsProvider } from './pexelsProvider'; // ← uncomment to switch

export const activeImageProvider = pixabayProvider;
// export const activeImageProvider = pexelsProvider; // ← swap to this line

export type { ImageProvider, ImageSearchOptions, StockImageResult } from './ImageProvider';