import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    GENIE_COMPLETE_STORAGE_KEY,
    cacheNameFor,
    loadGenieManifest,
    toUrl,
} from "../onboarding/genieImages";
import {
    cacheOne,
    clearStaleCaches,
    getCachedSet,
    isSupported,
} from "../utils/genieImageCache";

export type GeniePreloaderState =
    | { status: "idle" }
    | { status: "loading"; loaded: number; total: number; failed: string[] }
    | { status: "ready" }
    | { status: "error"; loaded: number; total: number; failed: string[] };

interface GeniePreloaderContextValue {
    state: GeniePreloaderState;
    retry: () => void;
}

const GeniePreloaderContext = createContext<GeniePreloaderContextValue | undefined>(undefined);

const CONCURRENCY = 4;

// Drains a queue of URLs with a fixed concurrency. Each worker pops the next
// URL and downloads it; on success bumps `loaded`, on failure pushes the URL
// into `failed`. Honors the abort signal to cancel in-flight fetches.
async function downloadAll(
    urls: string[],
    cacheName: string,
    signal: AbortSignal,
    onProgress: (delta: { loaded?: number; failed?: string }) => void,
): Promise<void> {
    let i = 0;
    const next = (): string | undefined => (i < urls.length ? urls[i++] : undefined);

    const worker = async () => {
        for (let url = next(); url !== undefined; url = next()) {
            if (signal.aborted) return;
            try {
                await cacheOne(cacheName, url, signal);
                onProgress({ loaded: 1 });
            } catch (err) {
                if (signal.aborted) return;
                console.warn("[genie-preloader] failed", url, err);
                onProgress({ failed: url });
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()),
    );
}

export const GeniePreloaderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<GeniePreloaderState>({ status: "idle" });
    const abortRef = useRef<AbortController | null>(null);
    const runIdRef = useRef(0);

    const run = useCallback(async () => {
        // Cancel any prior run so a quick retry doesn't double-fetch.
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const myRunId = ++runIdRef.current;
        const isStale = () => controller.signal.aborted || runIdRef.current !== myRunId;

        if (!isSupported()) {
            // Without Cache Storage we can't track per-file presence; the
            // browser's HTTP cache still benefits the tour, so just proceed.
            setState({ status: "ready" });
            return;
        }

        try {
            const manifest = await loadGenieManifest();
            if (isStale()) return;

            const cacheName = cacheNameFor(manifest.version);
            const urls = manifest.files.map(toUrl);
            const total = urls.length;

            await clearStaleCaches(cacheName);
            if (isStale()) return;

            const cached = await getCachedSet(cacheName);
            if (isStale()) return;

            const storedVersion = localStorage.getItem(GENIE_COMPLETE_STORAGE_KEY);
            const allCached = urls.every((u) => cached.has(u));
            if (storedVersion === manifest.version && allCached) {
                setState({ status: "ready" });
                return;
            }

            const missing = urls.filter((u) => !cached.has(u));
            const initialLoaded = total - missing.length;

            if (missing.length === 0) {
                localStorage.setItem(GENIE_COMPLETE_STORAGE_KEY, manifest.version);
                setState({ status: "ready" });
                return;
            }

            setState({
                status: "loading",
                loaded: initialLoaded,
                total,
                failed: [],
            });

            let loaded = initialLoaded;
            const failedSet = new Set<string>();

            await downloadAll(missing, cacheName, controller.signal, (delta) => {
                if (delta.loaded) loaded += delta.loaded;
                if (delta.failed) failedSet.add(delta.failed);
                if (isStale()) return;
                setState({
                    status: "loading",
                    loaded,
                    total,
                    failed: Array.from(failedSet),
                });
            });

            if (isStale()) return;

            if (failedSet.size === 0) {
                localStorage.setItem(GENIE_COMPLETE_STORAGE_KEY, manifest.version);
                setState({ status: "ready" });
            } else {
                setState({
                    status: "error",
                    loaded,
                    total,
                    failed: Array.from(failedSet),
                });
            }
        } catch (err) {
            if (isStale()) return;
            console.error("[genie-preloader] aborted with error", err);
            setState({
                status: "error",
                loaded: 0,
                total: 0,
                failed: [],
            });
        }
    }, []);

    useEffect(() => {
        run();
        return () => {
            abortRef.current?.abort();
        };
    }, [run]);

    const value = useMemo<GeniePreloaderContextValue>(
        () => ({ state, retry: run }),
        [state, run],
    );

    return (
        <GeniePreloaderContext.Provider value={value}>
            {children}
        </GeniePreloaderContext.Provider>
    );
};

export const useGeniePreloader = (): GeniePreloaderContextValue => {
    const ctx = useContext(GeniePreloaderContext);
    if (!ctx) {
        throw new Error("useGeniePreloader must be used within a GeniePreloaderProvider");
    }
    return ctx;
};
