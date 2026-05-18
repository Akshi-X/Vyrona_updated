/**
 * Variant Utilities
 *
 * Shared utilities and helpers for creating variant components.
 * These utilities help maintain consistency across variants and
 * reduce code duplication.
 *
 * USAGE:
 * Import these utilities in your variant components to:
 * - Wrap default components with customizations
 * - Create slot-based variants (recommended pattern)
 * - Share common variant layouts
 */

import React, { Suspense } from "react";

// =============================================================================
// SLOT-BASED VARIANT PATTERN
// =============================================================================

/**
 * Generic slot configuration type.
 * Slots allow variants to override specific parts of a component
 * without duplicating the entire component.
 */
export interface SlotConfig<
    T = Record<string, React.ComponentType | React.ReactNode>,
> {
    slots?: T;
}

/**
 * Creates a slot-based wrapper for a component.
 * This is the recommended pattern for variants that only need
 * to customize specific parts of a component.
 *
 * @example
 * ```tsx
 * // In your variant component:
 * const DashboardARC = createSlotWrapper(Dashboard, {
 *   headerSlot: <ARCHeader />,
 *   statsSlot: ARCStatsWidget,
 * });
 * ```
 */
export function createSlotWrapper<
    P extends object,
    S extends Record<string, unknown>,
>(
    DefaultComponent: React.ComponentType<P & { slots?: S }>,
    defaultSlots: Partial<S>,
): React.FC<Omit<P, "slots"> & { slots?: Partial<S> }> {
    const WrappedComponent: React.FC<
        Omit<P, "slots"> & { slots?: Partial<S> }
    > = (props) => {
        const { slots: propsSlots, ...restProps } = props;
        const mergedSlots = { ...defaultSlots, ...propsSlots } as S;

        return <DefaultComponent {...(restProps as P)} slots={mergedSlots} />;
    };

    WrappedComponent.displayName = `SlotWrapper(${DefaultComponent.displayName || DefaultComponent.name || "Component"})`;

    return WrappedComponent;
}

// =============================================================================
// VARIANT WRAPPER PATTERN
// =============================================================================

/**
 * Props for the VariantWrapper component.
 */
export interface VariantWrapperProps {
    /** The wrapped content */
    children: React.ReactNode;
    /** Hospital name for branding (optional) */
    hospitalName?: string;
    /** Additional CSS classes */
    className?: string;
    /** Show hospital badge in corner */
    showBadge?: boolean;
}

/**
 * A wrapper component that adds hospital branding to any variant.
 * Use this to maintain consistent branding across variants.
 *
 * @example
 * ```tsx
 * const DashboardARC = () => (
 *   <VariantWrapper hospitalName="ARC Fertility" showBadge>
 *     <div>Your custom content</div>
 *   </VariantWrapper>
 * );
 * ```
 */
export const VariantWrapper: React.FC<VariantWrapperProps> = ({
    children,
    hospitalName,
    className = "",
    showBadge = false,
}) => {
    return (
        <div className={`variant-wrapper ${className}`}>
            {showBadge && hospitalName && (
                <div className="variant-badge">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {hospitalName} Custom View
                    </span>
                </div>
            )}
            {children}
        </div>
    );
};

// =============================================================================
// SECTION OVERRIDE PATTERN
// =============================================================================

/**
 * Configuration for overriding sections of a component.
 */
export interface SectionOverride {
    /** Unique identifier for the section */
    id: string;
    /** Component to render instead of default */
    component: React.ComponentType;
    /** Position: 'replace', 'before', or 'after' the default */
    position?: "replace" | "before" | "after";
}

/**
 * Props for components that support section overrides.
 */
export interface WithSectionOverridesProps {
    sectionOverrides?: SectionOverride[];
}

/**
 * Hook to get the component for a section, considering overrides.
 *
 * @example
 * ```tsx
 * const Dashboard = ({ sectionOverrides }: WithSectionOverridesProps) => {
 *   const StatsSection = useSectionComponent('stats', DefaultStats, sectionOverrides);
 *   return <StatsSection />;
 * };
 * ```
 */
export function useSectionComponent(
    sectionId: string,
    DefaultComponent: React.ComponentType,
    overrides?: SectionOverride[],
): React.ComponentType {
    const override = overrides?.find((o) => o.id === sectionId);

    if (!override || override.position !== "replace") {
        return DefaultComponent;
    }

    return override.component;
}

/**
 * Renders a section with potential before/after overrides.
 */
export const SectionWithOverrides: React.FC<{
    sectionId: string;
    defaultContent: React.ReactNode;
    overrides?: SectionOverride[];
}> = ({ sectionId, defaultContent, overrides }) => {
    const beforeOverride = overrides?.find(
        (o) => o.id === sectionId && o.position === "before",
    );
    const afterOverride = overrides?.find(
        (o) => o.id === sectionId && o.position === "after",
    );
    const replaceOverride = overrides?.find(
        (o) => o.id === sectionId && o.position === "replace",
    );

    if (replaceOverride) {
        const ReplaceComponent = replaceOverride.component;
        return <ReplaceComponent />;
    }

    return (
        <>
            {beforeOverride && <beforeOverride.component />}
            {defaultContent}
            {afterOverride && <afterOverride.component />}
        </>
    );
};

// =============================================================================
// LOADING COMPONENTS
// =============================================================================

/**
 * Default loading spinner for lazy-loaded variant components.
 */
export const VariantLoadingSpinner: React.FC<{ size?: "sm" | "md" | "lg" }> = ({
    size = "md",
}) => {
    const sizeClasses = {
        sm: "h-4 w-4",
        md: "h-8 w-8",
        lg: "h-12 w-12",
    };

    return (
        <div className="flex items-center justify-center h-full min-h-[100px]">
            <div
                className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]}`}
            />
        </div>
    );
};

/**
 * Loading skeleton for variant components.
 */
export const VariantLoadingSkeleton: React.FC<{
    lines?: number;
    showHeader?: boolean;
}> = ({ lines = 3, showHeader = true }) => {
    return (
        <div className="animate-pulse p-4">
            {showHeader && (
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
            )}
            <div className="space-y-3">
                {Array.from({ length: lines }).map((_, i) => (
                    <div
                        key={i}
                        className="h-4 bg-gray-200 rounded"
                        style={{ width: `${Math.random() * 40 + 60}%` }}
                    />
                ))}
            </div>
        </div>
    );
};

// =============================================================================
// ERROR BOUNDARY FOR VARIANTS
// =============================================================================

interface VariantErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

interface VariantErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * Error boundary specifically for variant components.
 * Falls back gracefully if a variant component fails to render.
 */
export class VariantErrorBoundary extends React.Component<
    VariantErrorBoundaryProps,
    VariantErrorBoundaryState
> {
    constructor(props: VariantErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): VariantErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        // Log error in development only
        if (import.meta.env.DEV) {
            console.error(
                "[VariantErrorBoundary] Variant component error:",
                error,
                errorInfo,
            );
        }

        // Call optional error handler
        this.props.onError?.(error, errorInfo);
    }

    render(): React.ReactNode {
        if (this.state.hasError) {
            // Render fallback or default error UI
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h3 className="text-red-800 font-medium">
                        Unable to load custom view
                    </h3>
                    <p className="text-red-600 text-sm mt-1">
                        The custom component failed to load. Please try
                        refreshing the page.
                    </p>
                    {import.meta.env.DEV && this.state.error && (
                        <pre className="mt-2 text-xs text-red-500 overflow-auto">
                            {this.state.error.message}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

// =============================================================================
// HIGHER-ORDER COMPONENTS
// =============================================================================

/**
 * HOC that wraps a variant component with error boundary and suspense.
 *
 * @example
 * ```tsx
 * const SafeDashboardARC = withVariantSafety(DashboardARC, {
 *   fallback: <DefaultDashboard />,
 * });
 * ```
 */
export function withVariantSafety<P extends object>(
    VariantComponent: React.ComponentType<P>,
    options: {
        fallback?: React.ReactNode;
        loadingFallback?: React.ReactNode;
        onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
    } = {},
): React.FC<P> {
    const SafeVariant: React.FC<P> = (props) => {
        return (
            <VariantErrorBoundary
                fallback={options.fallback}
                onError={options.onError}
            >
                <Suspense
                    fallback={
                        options.loadingFallback || <VariantLoadingSpinner />
                    }
                >
                    <VariantComponent {...props} />
                </Suspense>
            </VariantErrorBoundary>
        );
    };

    SafeVariant.displayName = `withVariantSafety(${VariantComponent.displayName || VariantComponent.name || "Component"})`;

    return SafeVariant;
}

/**
 * HOC that adds hospital context to a variant component.
 * Useful when variants need access to hospital-specific data.
 */
export function withHospitalContext<P extends object>(
    VariantComponent: React.ComponentType<
        P & { hospitalId?: number; hospitalName?: string }
    >,
): React.FC<P> {
    const WithHospitalContext: React.FC<P> = (props) => {
        // In a real implementation, this would get hospital context from a provider
        // For now, we just pass through the props
        return <VariantComponent {...props} />;
    };

    WithHospitalContext.displayName = `withHospitalContext(${VariantComponent.displayName || VariantComponent.name || "Component"})`;

    return WithHospitalContext;
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Types are already exported inline with their definitions above.
// Re-exporting here for convenience (commented out to avoid conflicts):
// - SlotConfig
// - SectionOverride
// - WithSectionOverridesProps
// - VariantErrorBoundaryProps
// - VariantErrorBoundaryState
