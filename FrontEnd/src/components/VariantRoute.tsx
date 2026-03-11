/**
 * VariantRoute Component
 *
 * A wrapper component that renders organization-specific UI variants
 * based on the current user's hospital. If a custom variant exists
 * for the route, it renders that; otherwise, it falls back to the
 * default component.
 *
 * USAGE:
 * ```tsx
 * <VariantRoute
 *   routePath="/dashboard"
 *   defaultComponent={<Dashboard />}
 * />
 * ```
 *
 * SECURITY CONSIDERATIONS:
 * - Variant keys are not exposed in production error messages
 * - Component loading failures fall back silently to defaults
 * - No variant information is logged in production
 *
 * PERFORMANCE:
 * - Variant components are lazy-loaded only when needed
 * - Default component is shown immediately while loading
 * - Failed loads don't block the UI
 */

import React, { Suspense, useState, useEffect } from 'react';
import { useUIVariants } from '../contexts/UIVariantContext';
import { getVariantLoader, hasVariant as registryHasVariant } from '../variants/registry';

interface VariantRouteProps {
  /** The route path to check for variants (e.g., "/dashboard", "/track/:patientId") */
  routePath: string;
  /** The default component to render if no variant exists */
  defaultComponent: React.ReactNode;
  /** Optional loading component while lazy loading variant */
  fallback?: React.ReactNode;
  /** Props to pass to the variant component */
  componentProps?: Record<string, unknown>;
  /** Whether to show default immediately while loading (better UX, possible flash) */
  showDefaultWhileLoading?: boolean;
}

/**
 * Default loading fallback component
 */
const DefaultLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
  </div>
);

/**
 * VariantRoute - Renders organization-specific UI variants
 *
 * This component checks if the current user's hospital has a custom
 * component registered for the given route. If so, it lazy-loads and
 * renders that component. Otherwise, it renders the default.
 */
export const VariantRoute: React.FC<VariantRouteProps> = ({
  routePath,
  defaultComponent,
  fallback,
  componentProps = {},
  showDefaultWhileLoading = false,
}) => {
  const { getVariantKey, isLoading: isContextLoading } = useUIVariants();
  const [VariantComponent, setVariantComponent] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [isLoadingComponent, setIsLoadingComponent] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Get the variant key for this route
  const variantKey = getVariantKey(routePath);

  // Load the variant component when variant key changes
  useEffect(() => {
    let isMounted = true;

    const loadVariantComponent = async () => {
      // Reset state
      setVariantComponent(null);
      setLoadError(false);

      // No variant key means use default
      if (!variantKey) {
        return;
      }

      // Check if component exists in registry
      if (!registryHasVariant(variantKey)) {
        // SECURITY: Don't log variant key in production
        if (import.meta.env.DEV) {
          console.warn(
            `[VariantRoute] Variant "${variantKey}" for route "${routePath}" ` +
            `not found in registry. Using default component.`
          );
        }
        return;
      }

      setIsLoadingComponent(true);

      try {
        const loader = getVariantLoader(variantKey);
        if (loader && isMounted) {
          const module = await loader();
          if (isMounted) {
            setVariantComponent(() => module.default);
          }
        }
      } catch (error) {
        // SECURITY: Don't expose error details in production
        if (import.meta.env.DEV) {
          console.error(
            `[VariantRoute] Failed to load variant "${variantKey}":`,
            error
          );
        }
        if (isMounted) {
          setLoadError(true);
        }
      } finally {
        if (isMounted) {
          setIsLoadingComponent(false);
        }
      }
    };

    loadVariantComponent();

    return () => {
      isMounted = false;
    };
  }, [variantKey, routePath]);

  // Determine what to render based on loading states

  // If context is still loading variants from server
  if (isContextLoading) {
    if (showDefaultWhileLoading) {
      return <>{defaultComponent}</>;
    }
    return <>{fallback || <DefaultLoadingFallback />}</>;
  }

  // If there's no variant key, use default
  if (!variantKey) {
    return <>{defaultComponent}</>;
  }

  // If component is loading
  if (isLoadingComponent) {
    if (showDefaultWhileLoading) {
      return <>{defaultComponent}</>;
    }
    return <>{fallback || <DefaultLoadingFallback />}</>;
  }

  // If there was a load error, fall back to default
  if (loadError) {
    return <>{defaultComponent}</>;
  }

  // If variant component is loaded, render it with Suspense for any nested lazy loads
  if (VariantComponent) {
    return (
      <Suspense fallback={fallback || <DefaultLoadingFallback />}>
        <VariantComponent {...componentProps} />
      </Suspense>
    );
  }

  // Fallback to default (shouldn't normally reach here)
  return <>{defaultComponent}</>;
};

/**
 * Higher-order component version for wrapping route components
 *
 * USAGE:
 * ```tsx
 * const DashboardWithVariant = withVariant('/dashboard', Dashboard);
 * ```
 */
export function withVariant<P extends Record<string, unknown>>(
  routePath: string,
  DefaultComponent: React.ComponentType<P>,
  options: Omit<VariantRouteProps, 'routePath' | 'defaultComponent'> = {}
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => {
    return (
      <VariantRoute
        routePath={routePath}
        defaultComponent={<DefaultComponent {...props} />}
        componentProps={props as Record<string, unknown>}
        {...options}
      />
    );
  };

  // Set display name for debugging
  WrappedComponent.displayName = `withVariant(${DefaultComponent.displayName || DefaultComponent.name || 'Component'})`;

  return WrappedComponent;
}

/**
 * Hook to check if current user has a variant for a route
 * Useful for conditional rendering outside of VariantRoute
 *
 * USAGE:
 * ```tsx
 * const hasCustomDashboard = useHasVariant('/dashboard');
 * ```
 */
export function useHasVariant(routePath: string): boolean {
  const { hasVariant, isLoading } = useUIVariants();

  if (isLoading) {
    return false;
  }

  return hasVariant(routePath);
}

export default VariantRoute;
