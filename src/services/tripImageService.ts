/**
 * src/services/tripImageService.ts
 *
 * Handles persisting a trip's cover image — either:
 *   (a) a stock image URL (from the active ImageProvider, e.g. Pixabay), or
 *   (b) a user-uploaded photo (via expo-image-picker, uploaded to Supabase Storage)
 *
 * Both paths converge on the same DB column: TravelAppTrips.cover_image_url.
 * See the SQL migration note at the bottom of this file for the column you
 * need to add manually (per your request — you're adding it yourself).
 *
 * Upload strategy (React Native, not browser):
 *   fetch(uri) → .blob() → .arrayBuffer() → supabase.storage.upload(path, arrayBuffer)
 *   Blob/File are not reliable upload payloads in RN — ArrayBuffer is the
 *   documented, working approach for Supabase JS in Expo.
 */

import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';

const STORAGE_BUCKET = 'trip-covers';

// ─── Stock image (Pixabay/Pexels/etc — provider-agnostic by the time it
// reaches this function; it's just a URL string at this point) ───────────────

/**
 * Save a stock image URL as the trip's cover image.
 * No upload needed — the URL is stored directly and expo-image's disk
 * cache handles loading performance from there.
 */
export async function setTripCoverFromUrl(tripId: string, imageUrl: string): Promise<void> {
    const { error } = await supabase
        .from('TravelAppTrips')
        .update({ cover_image_url: imageUrl })
        .eq('id', tripId);

    if (error) {
        throw new Error(`[tripImageService] setTripCoverFromUrl: ${error.message}`);
    }
}

// ─── Stock image download + Supabase upload ───────────────────────────────────

/**
 * Downloads a stock image URL via our controlled fetch() (which can send
 * proper headers that the Image component cannot), then uploads it to
 * Supabase Storage under the same trip-covers bucket as user uploads.
 *
 * WHY this exists instead of setTripCoverFromUrl():
 *  - Pixabay and similar providers use CDN hotlink protection that rejects
 *    direct Image source requests from mobile apps (no Referer/User-Agent).
 *    Our fetch() can set a browser-like User-Agent that bypasses this.
 *  - Storing raw third-party CDN URLs is fragile: URLs may expire, change, or
 *    become unavailable. Uploading to our own Supabase bucket gives us full
 *    control and consistent availability.
 *  - Both user uploads and stock images then share the same Supabase public
 *    URL format — consistent, cacheable, and provider-agnostic.
 *
 * @param tripId       The trip to attach the cover to.
 * @param stockImageUrl The fullUrl from StockImageResult (e.g. Pixabay webformatURL).
 */
export async function downloadAndUploadStockImage(
    tripId: string,
    stockImageUrl: string,
): Promise<string> {
    // 1. Download the stock image.
    //    Pexels CDN (images.pexels.com) serves images without referrer or
    //    session requirements — a plain fetch() works reliably.
    //    10s AbortController timeout guards against slow connections.
    //    (Pixabay was the previous provider; its webformatURL CDN returned
    //    HTTP 429 on server-side fetch regardless of User-Agent, which is
    //    why we switched to Pexels.)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
        response = await fetch(stockImageUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(
            `[tripImageService] downloadAndUploadStockImage: HTTP ${response.status} ` +
            `downloading ${stockImageUrl}`,
        );
    }

    // 2. Read into binary buffer.
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    // 3. Derive content type and file extension.
    //    Pixabay webformat URLs typically serve JPEG. Fallback gracefully.
    const contentType = blob.type || response.headers.get('content-type') || 'image/jpeg';
    const rawExt = contentType.split('/')[1] ?? 'jpg';
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;

    // 4. Upload to trip-covers bucket under a collision-free path.
    const fileName = `${tripId}/${Crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, arrayBuffer, { contentType, upsert: false });

    if (uploadError) {
        throw new Error(
            `[tripImageService] downloadAndUploadStockImage: upload failed: ${uploadError.message}`,
        );
    }

    // 5. Resolve and persist the Supabase public URL.
    const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;
    await setTripCoverFromUrl(tripId, publicUrl);
    return publicUrl;
}

/**
 * Upload a user-picked image (from expo-image-picker) to Supabase Storage,
 * then save its public URL as the trip's cover image.
 *
 * @param tripId  — the trip to attach the cover to
 * @param localUri — the `file://...` URI returned by ImagePicker
 * @param mimeType — e.g. 'image/jpeg', from the picker result asset
 */
export async function uploadTripCoverImage(
    tripId: string,
    localUri: string,
    mimeType: string,
): Promise<string> {
    // 1. Read the local file into a binary buffer.
    //    fetch() works on file:// URIs in the Expo/Hermes runtime.
    const response = await fetch(localUri);
    if (!response.ok) {
        throw new Error('[tripImageService] Could not read the selected image file.');
    }
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    // 2. Build a unique, collision-free storage path.
    const extension = mimeType.split('/')[1] ?? 'jpg';
    const fileName = `${tripId}/${Crypto.randomUUID()}.${extension}`;

    // 3. Upload to the trip-covers bucket.
    const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, arrayBuffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
        throw new Error(`[tripImageService] Upload failed: ${uploadError.message}`);
    }

    // 4. Resolve the public URL (bucket must be public — see migration note).
    const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // 5. Persist on the trip row.
    await setTripCoverFromUrl(tripId, publicUrl);

    return publicUrl;
}