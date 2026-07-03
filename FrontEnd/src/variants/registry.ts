/**
 * UI Variant Component Registry
 *
 * This module provides automatic discovery and registration of variant components
 * using Vite's glob import feature. Components are lazy-loaded for optimal performance.
 *
 * DIRECTORY STRUCTURE:
 * src/variants/
 * ├── registry.ts              (this file)
 * ├── hospital-{id}/           (folder per hospital, e.g., hospital-2, hospital-5)
 * │   ├── Dashboard.tsx        (variant components follow naming convention)
 * │   ├── Track.tsx
 * │   └── ...
 * └── shared/                  (shared utilities, not auto-registered)
 *
 * NAMING CONVENTION:
 * - Folder: hospital-{hospital_id}  (e.g., hospital-2)
 * - File: {ComponentName}.tsx       (e.g., Dashboard.tsx, TrackPage.tsx)
 * - Registry Key: {ComponentName}Hospital{id} (e.g., DashboardHospital2)
 *
 * HOW TO ADD A NEW VARIANT:
 * 1. Create folder: src/variants/hospital-{id}/
 * 2. Create component file: src/variants/hospital-{id}/MyComponent.tsx
 * 3. Add database mapping with component_key: "MyComponentHospital{id}"
 * 4. The component is automatically discovered and registered!
 *
 * SECURITY NOTE:
 * - Component keys should not expose sensitive information
 * - The registry is built at compile time, all variant names are in the bundle
 * - Actual variant loading is controlled by server-side hospital_id validation
 */

import type { ComponentRegistry, LazyComponentLoader } from '../types/uiVariant';

// ============================================================
// AUTO-DISCOVERY USING VITE GLOB IMPORT
// ============================================================

/**
 * Vite's glob import to discover all variant components.
 * This creates a map of file paths to dynamic import functions.
 *
 * Pattern: ./hospital-{number}/{ComponentName}.tsx or ./named-folders/{ComponentName}.tsx
 * Excludes: shared folder, test files, index files
 */
const variantModules = import.meta.glob<{ default: React.ComponentType<unknown> }>(
  './*/[A-Z]*.tsx',
  { eager: false }
);

/**
 * Parse a variant module path to extract hospital ID and component name.
 *
 * @param path - Module path like "./hospital-2/Dashboard.tsx" or "./cryocan-and-refrigerator-hospital/Dashboard.tsx"
 * @returns Parsed info or null if path doesn't match expected pattern
 */
function parseVariantPath(path: string): {
  hospitalId: number;
  componentName: string;
  componentKey: string;
} | null {
  // Match pattern: ./hospital-{number}/{ComponentName}.tsx
  const digitMatch = path.match(/^\.\/hospital-(\d+)\/([A-Z][a-zA-Z0-9]*)\.tsx$/);

  if (digitMatch) {
    const hospitalId = parseInt(digitMatch[1], 10);
    const componentName = digitMatch[2];

    // Generate component key: {ComponentName}Hospital{id}
    // e.g., "Dashboard" + "Hospital" + "2" = "DashboardHospital2"
    const componentKey = `${componentName}Hospital${hospitalId}`;

    return {
      hospitalId,
      componentName,
      componentKey,
    };
  }

  // Match pattern: ./named-folder-slug/{ComponentName}.tsx
  const namedMatch = path.match(/^\.\/([a-z][a-z0-9-]*)\/([A-Z][a-zA-Z0-9]*)\.tsx$/);

  if (namedMatch) {
    const folderSlug = namedMatch[1]; // e.g., "cryocan-and-refrigerator-hospital"
    const componentName = namedMatch[2]; // e.g., "Dashboard"

    // Convert slug to PascalCase, filtering out "and"
    // "cryocan-and-refrigerator-hospital" → "CryocanRefrigeratorHospital"
    const folderPascal = folderSlug
      .split('-')
      .filter((part) => part !== 'and')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    const componentKey = `${folderPascal}${componentName}`;

    return {
      hospitalId: -1, // Named variants don't have a numeric hospital ID
      componentName,
      componentKey,
    };
  }

  return null;
}

// ============================================================
// BUILD THE REGISTRY
// ============================================================

/**
 * Dynamically built registry of all variant components.
 * Maps component_key (from database) → lazy loader function.
 */
const VARIANT_REGISTRY: ComponentRegistry = {};

/**
 * Metadata about discovered variants (useful for health checks)
 */
interface VariantMetadata {
  componentKey: string;
  hospitalId: number;
  componentName: string;
  modulePath: string;
}

const VARIANT_METADATA: VariantMetadata[] = [];

// Process all discovered modules and register them
for (const [path, loader] of Object.entries(variantModules)) {
  const parsed = parseVariantPath(path);

  if (parsed) {
    const { componentKey, hospitalId, componentName } = parsed;

    // Register the lazy loader
    VARIANT_REGISTRY[componentKey] = loader as LazyComponentLoader;

    // Store metadata for health checks
    VARIANT_METADATA.push({
      componentKey,
      hospitalId,
      componentName,
      modulePath: path,
    });

    // Log in development for debugging
    if (import.meta.env.DEV) {
      console.debug(`[Variant Registry] Registered: ${componentKey} from ${path}`);
    }
  } else if (import.meta.env.DEV) {
    console.warn(`[Variant Registry] Skipped invalid path: ${path}`);
  }
}

// ============================================================
// EXPORTS
// ============================================================

export { VARIANT_REGISTRY, VARIANT_METADATA };
export type { VariantMetadata };

/**
 * Get a variant component loader by its key.
 * Returns undefined if not found (will fall back to default).
 *
 * SECURITY: This function does not log the requested key in production
 * to prevent information leakage about which variants exist.
 *
 * @param key - The component key (e.g., "DashboardHospital2")
 */
export function getVariantLoader(key: string): LazyComponentLoader | undefined {
  const loader = VARIANT_REGISTRY[key];

  if (!loader && import.meta.env.DEV) {
    console.warn(`[Variant Registry] Component "${key}" not found in registry`);
  }

  return loader;
}

/**
 * Check if a variant exists in the registry.
 *
 * @param key - The component key to check
 */
export function hasVariant(key: string): boolean {
  return key in VARIANT_REGISTRY;
}

/**
 * Get all registered component keys.
 * Used for health checks and admin tooling.
 */
export function getRegisteredKeys(): string[] {
  return Object.keys(VARIANT_REGISTRY);
}

/**
 * Get all variant metadata.
 * Used for health checks and admin tooling.
 */
export function getVariantMetadata(): VariantMetadata[] {
  return [...VARIANT_METADATA];
}

/**
 * Get variants for a specific hospital.
 *
 * @param hospitalId - The hospital ID to filter by
 */
export function getVariantsForHospital(hospitalId: number): VariantMetadata[] {
  return VARIANT_METADATA.filter((v) => v.hospitalId === hospitalId);
}
