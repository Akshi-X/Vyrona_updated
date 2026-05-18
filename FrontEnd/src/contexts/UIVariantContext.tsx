/**
 * UI Variant Context
 *
 * Provides organization-specific UI variant mappings throughout the application.
 * Variants are fetched after authentication.
 *
 * SECURITY CONSIDERATIONS:
 * - Hospital ID is derived from the authenticated user (server-side validation)
 * - Variant information is not exposed in error messages in production
 *
 * USAGE:
 * ```tsx
 * const { getVariantKey, isLoading } = useUIVariants();
 * const variantKey = getVariantKey('/dashboard');
 * ```
 */

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react";
import type { ReactNode } from "react";
import type { UIVariantMap, UIVariantMapping } from "../types/uiVariant";
import { uiVariantService } from "../services/uiVariantService";
import { useAuth } from "./AuthContext";
import { FullPageLoader } from "../components/FullPageLoader";

interface UIVariantContextType {
    /** Map of route_path → component_key */
    variantMap: UIVariantMap;
    /** Whether variants are still being loaded */
    isLoading: boolean;
    /** Whether there was an error loading variants */
    hasError: boolean;
    /** Get the component key for a specific route (or undefined for default) */
    getVariantKey: (routePath: string) => string | undefined;
    /** Check if a route has a custom variant */
    hasVariant: (routePath: string) => boolean;
    /** Refresh variants from the server */
    refreshVariants: () => Promise<void>;
}

const UIVariantContext = createContext<UIVariantContextType | undefined>(
    undefined,
);

/**
 * Hook to access UI variant context.
 * Returns a safe default if used outside the provider (e.g., in error boundaries).
 */
export const useUIVariants = (): UIVariantContextType => {
    const context = useContext(UIVariantContext);

    if (!context) {
        // Safe fallback for components outside provider
        if (import.meta.env.DEV) {
            console.warn(
                "[UIVariantContext] useUIVariants called outside UIVariantProvider - returning default context",
            );
        }
        return {
            variantMap: new Map(),
            isLoading: false,
            hasError: false,
            getVariantKey: () => undefined,
            hasVariant: () => false,
            refreshVariants: async () => {},
        };
    }

    return context;
};

interface UIVariantProviderProps {
    children: ReactNode;
}

export const UIVariantProvider: React.FC<UIVariantProviderProps> = ({
    children,
}) => {
    const { isAuthenticated, token } = useAuth();

    const [variantMap, setVariantMap] = useState<UIVariantMap>(new Map());
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);

    /**
     * Load variants from the server.
     */
    const loadVariants = useCallback(async () => {
        if (!isAuthenticated || !token) {
            setVariantMap(new Map());
            setHasError(false);
            return;
        }

        setIsLoading(true);
        setHasError(false);

        try {
            const variants: UIVariantMapping[] =
                await uiVariantService.getVariantsForCurrentHospital();

            // Convert array to Map for O(1) lookup
            const map = new Map<string, string>();
            variants.forEach((v) => {
                map.set(v.route_path, v.component_key);
            });

            setVariantMap(map);

            if (import.meta.env.DEV) {
                console.log(`[UIVariantContext] Loaded ${map.size} variants`);
            }
        } catch (error) {
            // SECURITY: Don't expose error details in production
            if (import.meta.env.DEV) {
                console.error(
                    "[UIVariantContext] Failed to load variants:",
                    error,
                );
            }
            setVariantMap(new Map());
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, token]);

    /**
     * Force refresh variants from the server.
     */
    const refreshVariants = useCallback(async () => {
        await loadVariants();
    }, [loadVariants]);

    /**
     * Get the component key for a specific route.
     * Returns undefined if no variant exists (use default component).
     *
     * SECURITY: This function does not log route lookups in production
     * to prevent information leakage about which routes have variants.
     */
    const getVariantKey = useCallback(
        (routePath: string): string | undefined => {
            const key = variantMap.get(routePath);

            // Also try matching parameterized routes
            // e.g., "/track/123" should match "/track/:patientId"
            if (!key) {
                for (const [pattern, componentKey] of variantMap.entries()) {
                    if (matchRoute(pattern, routePath)) {
                        return componentKey;
                    }
                }
            }

            return key;
        },
        [variantMap],
    );

    /**
     * Check if a route has a custom variant.
     */
    const hasVariant = useCallback(
        (routePath: string): boolean => {
            return getVariantKey(routePath) !== undefined;
        },
        [getVariantKey],
    );

    // Load variants when authentication state changes
    useEffect(() => {
        if (isAuthenticated && token) {
            loadVariants();
        }
    }, [isAuthenticated, token, loadVariants]);

    // Clear variants on logout
    useEffect(() => {
        if (!isAuthenticated) {
            setVariantMap(new Map());
            setHasError(false);
        }
    }, [isAuthenticated]);

    // Memoize the context value to prevent unnecessary re-renders
    const value = useMemo<UIVariantContextType>(
        () => ({
            variantMap,
            isLoading,
            hasError,
            getVariantKey,
            hasVariant,
            refreshVariants,
        }),
        [
            variantMap,
            isLoading,
            hasError,
            getVariantKey,
            hasVariant,
            refreshVariants,
        ],
    );

    // Full-page loader until UI variants fetch completes (authenticated users only)
    if (isAuthenticated && isLoading) {
        return (
            <UIVariantContext.Provider value={value}>
                <FullPageLoader />
            </UIVariantContext.Provider>
        );
    }

    return (
        <UIVariantContext.Provider value={value}>
            {children}
        </UIVariantContext.Provider>
    );
};

/**
 * Simple route matching function that supports parameterized routes.
 * Matches patterns like "/track/:patientId" against paths like "/track/123".
 *
 * @param pattern - Route pattern with optional parameters (e.g., "/track/:patientId")
 * @param path - Actual path to match against (e.g., "/track/123")
 * @returns True if the path matches the pattern
 */
function matchRoute(pattern: string, path: string): boolean {
    // Convert pattern to regex
    // Replace :paramName with a regex group that matches any non-slash characters
    const regexPattern = pattern
        .replace(/:[^/]+/g, "[^/]+")
        .replace(/\//g, "\\/");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
}

export default UIVariantContext;
