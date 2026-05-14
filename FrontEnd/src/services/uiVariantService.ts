/**
 * UI Variant Service
 *
 * Fetches organization-specific UI variant mappings from the backend.
 *
 * SECURITY CONSIDERATIONS:
 * - Never exposes variant keys in client-side errors
 * - Hospital ID is always derived from authenticated user's token (server-side)
 * - No client-provided hospital_id is sent to the API
 */

import { BaseApiService } from "./baseApiService";
import type {
    UIVariantMapping,
    UIVariantMappingWithMeta,
} from "../types/uiVariant";

class UIVariantService extends BaseApiService {
    /**
     * Fetch UI variant mappings for the current user's hospital.
     * Hospital ID is derived server-side from the JWT token for security.
     */
    async getVariantsForCurrentHospital(): Promise<UIVariantMapping[]> {
        try {
            // SECURITY: No hospital_id is sent - server derives it from JWT
            const variants = await this.request<UIVariantMapping[]>(
                "/api/ui-variants/",
                {
                    method: "GET",
                },
            );

            return variants;
        } catch (error) {
            // SECURITY: Don't expose error details in production
            if (import.meta.env.DEV) {
                console.warn("Failed to fetch UI variants:", error);
            }
            // Return empty array on error - fallback to default components
            return [];
        }
    }

    /**
     * Get all variants for health check (admin-only endpoint)
     * This is used in development/staging to verify DB and code are in sync.
     */
    async getAllVariantsForHealthCheck(): Promise<UIVariantMappingWithMeta[]> {
        // Only allow in non-production environments
        if (import.meta.env.PROD) {
            console.warn(
                "Health check endpoint should not be called in production",
            );
            return [];
        }

        try {
            return await this.request<UIVariantMappingWithMeta[]>(
                "/api/ui-variants/health-check",
                {
                    method: "GET",
                },
            );
        } catch (error) {
            if (import.meta.env.DEV) {
                console.warn(
                    "Failed to fetch variants for health check:",
                    error,
                );
            }
            return [];
        }
    }
}

export const uiVariantService = new UIVariantService();
