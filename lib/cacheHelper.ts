/**
 * Helper utilities to manage offline caching of clinical guideline PDFs.
 * Utilizes the browser's Cache Storage API directly.
 */

const CACHE_NAME = 'anaessop-pdf-v1';

/**
 * Pre-emptively downloads and caches a guideline PDF for rapid offline retrieval.
 */
export async function cachePdfOffline(filename: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    const pdfUrl = `/api/pdf?file=${encodeURIComponent(filename)}`;
    
    // Perform fetch and cache.add
    await cache.add(pdfUrl);
    console.log(`[CacheHelper] Successfully cached PDF locally: ${filename}`);
    return true;
  } catch (err) {
    console.error(`[CacheHelper] Failed to cache PDF offline for ${filename}:`, err);
    return false;
  }
}

/**
 * Removes a guideline PDF from local Cache Storage.
 */
export async function removePdfFromCache(filename: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    const pdfUrl = `/api/pdf?file=${encodeURIComponent(filename)}`;
    const deleted = await cache.delete(pdfUrl);
    console.log(`[CacheHelper] Removed PDF from local cache: ${filename} (status: ${deleted})`);
    return deleted;
  } catch (err) {
    console.error(`[CacheHelper] Failed to delete PDF cache for ${filename}:`, err);
    return false;
  }
}

/**
 * Checks if a specific PDF is currently stored in the cache.
 */
export async function isPdfCached(filename: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    const pdfUrl = `/api/pdf?file=${encodeURIComponent(filename)}`;
    const match = await cache.match(pdfUrl);
    return !!match;
  } catch (err) {
    console.error(`[CacheHelper] Failed to check cache status for ${filename}:`, err);
    return false;
  }
}
