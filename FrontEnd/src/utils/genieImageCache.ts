// Cache Storage API helpers for the genie image preloader.
// Pure functions — no React. The active cache name is derived at runtime
// from the manifest version, so these helpers are version-agnostic.

import { GENIE_CACHE_PREFIX } from "../onboarding/genieImages";

export const isSupported = (): boolean =>
    typeof window !== "undefined"
    && typeof window.caches !== "undefined"
    && typeof window.fetch === "function";

export async function getCachedSet(cacheName: string): Promise<Set<string>> {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    // request.url is fully-qualified (origin + path); we normalize to pathname
    // so the set matches the relative URLs we feed in (e.g. "/genie/foo.webp").
    return new Set(requests.map((r) => new URL(r.url).pathname));
}

export async function cacheOne(
    cacheName: string,
    url: string,
    signal: AbortSignal,
): Promise<void> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }
    const cache = await caches.open(cacheName);
    await cache.put(url, response);
}

export async function clearStaleCaches(activeName: string): Promise<void> {
    const names = await caches.keys();
    await Promise.all(
        names
            .filter((n) => n.startsWith(GENIE_CACHE_PREFIX) && n !== activeName)
            .map((n) => caches.delete(n)),
    );
}
