/**
 * Variant Health Check Utility
 *
 * This utility verifies that the UI variant system is healthy by checking:
 * 1. All database variants have corresponding components in the registry
 * 2. All registered components have corresponding database mappings (detect dead code)
 * 3. Components can be loaded without errors
 *
 * USAGE:
 * - Triggered automatically after the user authenticates (dev/staging only)
 * - Can be triggered manually via browser console: window.__checkVariantHealth()
 * - Should be run in staging before deployments
 *
 * SECURITY NOTE:
 * - This utility should ONLY run in development/staging environments
 * - Production builds should not expose variant health check endpoints
 * - Health check results should not be logged to external services
 */

import type {
    VariantHealthCheckResult,
    VariantHealthIssue,
    UIVariantMappingWithMeta,
} from "../types/uiVariant";
import {
    getRegisteredKeys,
    getVariantMetadata,
    getVariantLoader,
} from "../variants/registry";
import { uiVariantService } from "../services/uiVariantService";

/**
 * Perform a comprehensive health check of the variant system.
 *
 * @param fetchFromServer - Whether to fetch DB variants from server (requires auth & admin endpoint)
 * @returns Health check result with status, issues, and stats
 */
export async function checkVariantHealth(
    fetchFromServer: boolean = true,
): Promise<VariantHealthCheckResult> {
    // Only allow in non-production environments
    if (import.meta.env.PROD) {
        return {
            status: "error",
            timestamp: new Date().toISOString(),
            issues: [
                {
                    type: "invalid_component",
                    severity: "error",
                    message: "Health check is disabled in production",
                },
            ],
            stats: {
                registryCount: 0,
                dbCount: 0,
                orphanedInRegistry: 0,
                missingFromRegistry: 0,
            },
        };
    }

    const issues: VariantHealthIssue[] = [];
    const registryKeys = new Set(getRegisteredKeys());
    const registryMetadata = getVariantMetadata();

    let dbVariants: UIVariantMappingWithMeta[] = [];
    let dbKeys = new Set<string>();

    // Fetch DB variants if requested
    if (fetchFromServer) {
        try {
            dbVariants = await uiVariantService.getAllVariantsForHealthCheck();
            dbKeys = new Set(dbVariants.map((v) => v.component_key));
        } catch (error) {
            issues.push({
                type: "invalid_component",
                severity: "warning",
                message: `Failed to fetch DB variants: ${error instanceof Error ? error.message : "Unknown error"}. Skipping DB validation.`,
            });
        }
    }

    // Check 1: DB variants that are missing from the registry
    for (const variant of dbVariants) {
        if (!registryKeys.has(variant.component_key)) {
            issues.push({
                type: "missing_from_registry",
                severity: "error",
                message: `Database variant "${variant.component_key}" for hospital ${variant.hospital_id} (route: ${variant.route_path}) is not found in the code registry. Users will see the default component instead.`,
                componentKey: variant.component_key,
                hospitalId: variant.hospital_id,
                routePath: variant.route_path,
            });
        }
    }

    // Check 2: Registry components that have no DB mapping (potential dead code)
    for (const key of registryKeys) {
        if (!dbKeys.has(key)) {
            const metadata = registryMetadata.find(
                (m) => m.componentKey === key,
            );
            issues.push({
                type: "orphaned_in_registry",
                severity: "warning",
                message: `Registry component "${key}"${metadata ? ` (hospital ${metadata.hospitalId})` : ""} has no database mapping. This may be dead code or a missing DB migration.`,
                componentKey: key,
                hospitalId: metadata?.hospitalId,
            });
        }
    }

    // Check 3: Verify that registered components can be loaded
    const loadTestPromises = Array.from(registryKeys).map(async (key) => {
        try {
            const loader = getVariantLoader(key);
            if (loader) {
                // Attempt to load the component (this validates the import path)
                await loader();
            }
        } catch (error) {
            issues.push({
                type: "invalid_component",
                severity: "error",
                message: `Failed to load component "${key}": ${error instanceof Error ? error.message : "Unknown error"}`,
                componentKey: key,
            });
        }
    });

    await Promise.all(loadTestPromises);

    // Calculate stats
    const orphanedInRegistry = Array.from(registryKeys).filter(
        (key) => !dbKeys.has(key),
    ).length;
    const missingFromRegistry = dbVariants.filter(
        (v) => !registryKeys.has(v.component_key),
    ).length;

    // Determine overall status
    let status: "healthy" | "warning" | "error" = "healthy";
    if (issues.some((i) => i.severity === "error")) {
        status = "error";
    } else if (issues.some((i) => i.severity === "warning")) {
        status = "warning";
    }

    return {
        status,
        timestamp: new Date().toISOString(),
        issues,
        stats: {
            registryCount: registryKeys.size,
            dbCount: dbVariants.length,
            orphanedInRegistry,
            missingFromRegistry,
        },
    };
}

/**
 * Run health check and log results to console.
 * Intended for development use.
 */
export async function runHealthCheckWithLogging(): Promise<VariantHealthCheckResult> {
    if (import.meta.env.PROD) {
        console.warn("Variant health check is disabled in production");
        return checkVariantHealth(false);
    }

    console.group("🔍 UI Variant Health Check");
    console.log("Starting health check...");

    const result = await checkVariantHealth(true);

    // Log stats
    console.log("\n📊 Stats:");
    console.table(result.stats);

    // Log issues by severity
    if (result.issues.length === 0) {
        console.log("\n✅ No issues found! Variant system is healthy.");
    } else {
        const errors = result.issues.filter((i) => i.severity === "error");
        const warnings = result.issues.filter((i) => i.severity === "warning");

        if (errors.length > 0) {
            console.group("\n❌ Errors:");
            errors.forEach((issue) => {
                console.error(`[${issue.type}] ${issue.message}`);
            });
            console.groupEnd();
        }

        if (warnings.length > 0) {
            console.group("\n⚠️ Warnings:");
            warnings.forEach((issue) => {
                console.warn(`[${issue.type}] ${issue.message}`);
            });
            console.groupEnd();
        }
    }

    // Summary
    const statusEmoji = {
        healthy: "✅",
        warning: "⚠️",
        error: "❌",
    };
    console.log(
        `\n${statusEmoji[result.status]} Overall Status: ${result.status.toUpperCase()}`,
    );
    console.log(`Timestamp: ${result.timestamp}`);

    console.groupEnd();

    return result;
}

/**
 * Quick check that only validates the registry (no server call).
 * Useful for fast startup validation.
 */
export function quickRegistryCheck(): {
    valid: boolean;
    componentCount: number;
    components: string[];
} {
    const keys = getRegisteredKeys();
    const metadata = getVariantMetadata();

    if (import.meta.env.DEV) {
        console.log(
            `[Variant Registry] Found ${keys.length} registered components:`,
        );
        metadata.forEach((m) => {
            console.log(
                `  - ${m.componentKey} (hospital-${m.hospitalId}/${m.componentName})`,
            );
        });
    }

    return {
        valid: true,
        componentCount: keys.length,
        components: keys,
    };
}

/**
 * Initialize registry metadata and expose the manual health check helper on
 * `window.__checkVariantHealth()`.  Intentionally does NOT perform the full
 * server-side health check here — that requires an authenticated session and
 * is triggered separately via `runAuthenticatedHealthCheck` once the user
 * logs in.
 *
 * Call this once from main.tsx in non-production builds.
 */
export function initializeHealthCheck(): void {
    if (import.meta.env.PROD) {
        return;
    }

    // Run quick registry check immediately (no network call)
    const quickResult = quickRegistryCheck();
    console.log(
        `[Variant Registry] Initialized with ${quickResult.componentCount} components`,
    );

    // Expose the full health check on window for manual use in devtools
    if (typeof window !== "undefined") {
        (
            window as unknown as {
                __checkVariantHealth: typeof runHealthCheckWithLogging;
            }
        ).__checkVariantHealth = runHealthCheckWithLogging;
        console.log(
            "[Variant Health Check] Run window.__checkVariantHealth() to perform a full health check (requires active session)",
        );
    }
}

/**
 * Run the full authenticated health check (registry + server DB comparison).
 *
 * This is the entry-point that should be called AFTER the user has
 * successfully authenticated, e.g. from a `useEffect` inside AuthContext
 * that reacts to `isAuthenticated` becoming `true`.
 *
 * It is a no-op in production and safe to call multiple times — a module-level
 * flag ensures the check only runs once per page load.
 */
let healthCheckRan = false;

export function runAuthenticatedHealthCheck(): void {
    if (import.meta.env.PROD) {
        return;
    }

    // Only run once per page load to avoid spamming the console / server on
    // re-renders or token refreshes.
    if (healthCheckRan) {
        return;
    }
    healthCheckRan = true;

    runHealthCheckWithLogging().catch((error) => {
        console.error("[Variant Health Check] Failed to run:", error);
    });
}

export default {
    checkVariantHealth,
    runHealthCheckWithLogging,
    quickRegistryCheck,
    initializeHealthCheck,
    runAuthenticatedHealthCheck,
};
