/**
 * src/services/imageProviders/index.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONLY FILE TO EDIT WHEN SWITCHING IMAGE PROVIDERS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ACTIVE PROVIDER: Pexels
 *
 * WHY NOT PIXABAY:
 *   Pixabay's webformatURL uses CDN hotlink protection that blocks server-side
 *   fetch() calls (HTTP 429) regardless of User-Agent spoofing. This is by
 *   design — Pixabay only allows browser-session hotlinking, not programmatic
 *   downloads. Our download-and-rehost-to-Supabase flow is therefore
 *   incompatible with Pixabay's free tier.
 *
 * WHY PEXELS:
 *   - Images are served from images.pexels.com CDN with no hotlink protection.
 *   - fetch() works reliably for download-and-upload (confirmed).
 *   - Free API: 200 requests/hour (pexels.com/api — instant signup, no wait).
 *   - License: Pexels License allows display and storage with attribution.
 *   - photo.src.medium (~350px) is a better preview than Pixabay's previewURL (150px).
 *   - photo.src.large (~1200px) is the Supabase-uploaded full cover image.
 *
 * To switch back to Pixabay or add another provider:
 *   1. Uncomment / change the import line
 *   2. Swap the export assignment
 *   3. Set the new provider's env var
 *   No other file needs to change.
 *
 * REQUIRED ENV VAR: EXPO_PUBLIC_PEXELS_API_KEY
 *   Get a free key at https://www.pexels.com/api/
 *   Add to .env.local: EXPO_PUBLIC_PEXELS_API_KEY=your_key_here
 */

// import { pixabayProvider } from './pixabayProvider'; // ← swap back if needed
import { pexelsProvider } from './pexelsProvider';

// export const activeImageProvider = pixabayProvider; // ← Pixabay (has CDN 429 issue)
export const activeImageProvider = pexelsProvider;

export type { ImageProvider, ImageSearchOptions, StockImageResult } from './ImageProvider';