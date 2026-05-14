/**
 * UI Variant Types
 *
 * Types for the multi-tenant UI variant system that allows
 * different organizations (hospitals) to have custom UI components
 * for specific routes.
 */

/**
 * Represents a UI variant mapping from the database.
 * Maps a route path to a specific component key for a hospital.
 */
export interface UIVariantMapping {
    route_path: string; // e.g., "/dashboard", "/track/:patientId"
    component_key: string; // e.g., "DashboardARC", "TrackHospital5"
}

/**
 * Extended variant mapping with metadata (used for admin/health checks)
 */
export interface UIVariantMappingWithMeta extends UIVariantMapping {
    id: number;
    hospital_id: number;
    is_active: boolean;
    description?: string;
    created_at?: string;
    updated_at?: string;
}

/**
 * The shape of the UI variants stored in context.
 * Key is the route path, value is the component key.
 */
export type UIVariantMap = Map<string, string>;

/**
 * Lazy component loader type for dynamic imports
 */
export type LazyComponentLoader = () => Promise<{
    default: React.ComponentType<unknown>;
}>;

/**
 * Registry of all available variant components.
 * Maps component_key to a lazy loader function.
 */
export type ComponentRegistry = Record<string, LazyComponentLoader>;

/**
 * Health check result for variant system
 */
export interface VariantHealthCheckResult {
    status: "healthy" | "warning" | "error";
    timestamp: string;
    issues: VariantHealthIssue[];
    stats: {
        registryCount: number;
        dbCount: number;
        orphanedInRegistry: number;
        missingFromRegistry: number;
    };
}

/**
 * Individual health check issue
 */
export interface VariantHealthIssue {
    type:
        | "missing_from_registry"
        | "orphaned_in_registry"
        | "invalid_component";
    severity: "warning" | "error";
    message: string;
    componentKey?: string;
    hospitalId?: number;
    routePath?: string;
}
