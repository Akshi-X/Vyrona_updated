// Runtime helper for the genie image preloader.
// The manifest itself is generated at build time by the genie-manifest Vite
// plugin (see vite.config.ts) — adding/removing/replacing a .webp in
// public/genie/ updates the file list and version hash automatically.

export const GENIE_CACHE_PREFIX = "genie-";
export const GENIE_MANIFEST_URL = "/genie/manifest.json";
export const GENIE_COMPLETE_STORAGE_KEY = "genie_cache_complete";

export interface GenieManifest {
    version: string;
    files: string[];
}

export const toUrl = (filename: string): string => `/genie/${filename}`;

export const cacheNameFor = (version: string): string =>
    `${GENIE_CACHE_PREFIX}${version}`;

export async function loadGenieManifest(): Promise<GenieManifest> {
    // no-cache so we always pick up a freshly regenerated manifest after a
    // file is added — the binary images themselves are still cached.
    const res = await fetch(GENIE_MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok) {
        throw new Error(`Genie manifest fetch failed: ${res.status}`);
    }
    const data = (await res.json()) as GenieManifest;
    if (!data.version || !Array.isArray(data.files)) {
        throw new Error("Genie manifest is malformed");
    }
    return data;
}
