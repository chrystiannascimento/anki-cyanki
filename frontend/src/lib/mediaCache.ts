/**
 * UC-02 — Armazenamento Separado para Conteúdo Offline
 *
 * Dynamic media (images referenced in flashcard/notebook Markdown) are fetched
 * and stored natively as Blobs in IndexedDB via the `mediaCache` table.
 * This avoids the ~33 % size overhead of Base64 and enables fine-grained
 * storage control (quota checks, per-card pruning, age-based eviction).
 *
 * Static UI assets (JS, CSS, icons) are handled by the Workbox Service Worker
 * via Cache API — see vite.config.ts for the runtime caching configuration.
 */

import { db } from './db';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract all external image URLs from a Markdown/HTML string. */
function extractImageUrls(content: string): string[] {
    const urls: string[] = [];

    // Markdown images: ![alt](https://...)
    const mdImage = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdImage.exec(content)) !== null) urls.push(m[1]);

    // HTML img tags: <img src="https://...">
    const htmlImg = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
    while ((m = htmlImg.exec(content)) !== null) urls.push(m[1]);

    return [...new Set(urls)]; // deduplicate
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single external URL and persist its binary payload as a Blob in
 * IndexedDB. Silently no-ops if the URL is already cached or if the fetch
 * fails (network error, non-2xx status). Safe to call repeatedly.
 */
export async function cacheMedia(url: string, flashcardId?: string): Promise<void> {
    const existing = await db.mediaCache.get(url);
    if (existing) return; // already cached — skip re-download

    try {
        const response = await fetch(url);
        if (!response.ok) return;

        const blob = await response.blob();
        await db.mediaCache.put({
            url,
            blob,
            mimeType: blob.type || 'application/octet-stream',
            size: blob.size,
            cachedAt: Date.now(),
            flashcardId
        });
    } catch {
        // Network unavailable or CORS blocked — silently ignore.
        // The caller falls back to the original URL for display.
    }
}

/**
 * Resolve a URL for use as an `<img src>` attribute.
 * Returns an `object://` Blob URL if the media is cached locally, otherwise
 * returns the original URL (online fallback).
 *
 * IMPORTANT: The returned Object URL is created with `URL.createObjectURL`.
 * Call `URL.revokeObjectURL(result)` when the image is no longer rendered to
 * avoid memory leaks (e.g., in Svelte's `onDestroy`).
 */
export async function resolveMediaUrl(url: string): Promise<string> {
    try {
        const entry = await db.mediaCache.get(url);
        if (entry) {
            return URL.createObjectURL(entry.blob);
        }
    } catch {
        // IndexedDB read failed — fall through to original URL
    }
    return url;
}

/**
 * Parse a Markdown/HTML string, extract all external image URLs and cache
 * each one that is not already stored. Runs concurrently.
 *
 * Typical usage: call after parsing a notebook or loading a flashcard set.
 */
export async function cacheMediaFromMarkdown(content: string, flashcardId?: string): Promise<void> {
    const urls = extractImageUrls(content);
    if (urls.length === 0) return;
    await Promise.all(urls.map(url => cacheMedia(url, flashcardId)));
}

// ---------------------------------------------------------------------------
// Storage management
// ---------------------------------------------------------------------------

export interface StorageInfo {
    /** Total bytes consumed by this origin (IndexedDB + Cache API + etc.) */
    usage: number;
    /** Total bytes available to this origin */
    quota: number;
    /** Percentage of quota consumed (0–100) */
    percent: number;
    /** Bytes stored in the mediaCache table specifically */
    mediaCacheSize: number;
    /** Number of entries in the mediaCache table */
    mediaCacheCount: number;
}

/**
 * Return an estimate of storage consumption for this origin, including a
 * breakdown of how much the mediaCache table occupies.
 * Uses the Storage API (`navigator.storage.estimate`).
 */
export async function getStorageInfo(): Promise<StorageInfo> {
    let usage = 0;
    let quota = 0;

    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        usage = estimate.usage ?? 0;
        quota = estimate.quota ?? 0;
    }

    const entries = await db.mediaCache.toArray();
    const mediaCacheSize = entries.reduce((sum, e) => sum + e.size, 0);

    return {
        usage,
        quota,
        percent: quota > 0 ? Math.round((usage / quota) * 10000) / 100 : 0,
        mediaCacheSize,
        mediaCacheCount: entries.length
    };
}

/**
 * Delete all mediaCache entries whose `cachedAt` timestamp is older than
 * `maxAgeMs` milliseconds (default: 30 days). Returns the number of entries
 * removed. Useful for freeing storage space on low-capacity devices.
 */
export async function pruneOldMedia(maxAgeMs = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    const keys = await db.mediaCache
        .where('cachedAt')
        .below(cutoff)
        .primaryKeys() as string[];

    if (keys.length === 0) return 0;
    await db.mediaCache.bulkDelete(keys);
    return keys.length;
}

/**
 * Delete all mediaCache entries associated with a specific flashcard.
 * Call when a flashcard is deleted to avoid orphan blobs.
 */
export async function pruneMediaForCard(flashcardId: string): Promise<void> {
    await db.mediaCache.where('flashcardId').equals(flashcardId).delete();
}

/**
 * Clear the entire media cache. Use from the storage management panel or
 * when the user logs out (clearCyankiData already calls db.mediaCache.clear).
 */
export async function clearMediaCache(): Promise<void> {
    await db.mediaCache.clear();
}
