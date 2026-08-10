import { createBrowserRouter, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import TrackAndTrace from "../pages/TrackAndTrace";
import TrackPage from "../pages/Track";
import IVFTrackShipmentPage from "../pages/IVFTrackShipment";
import IVFTrackShipmentSearchPage from "../pages/IVFTrackShipment/IVFTrackShipmentSearch";
import OutboundQualityTrackingPage from "../pages/OutboundQualityTracking";
import UserProfilePage from "../pages/UserProfilePage";
import Support from "../pages/Support";
import NotFound from "../pages/NotFound";
import VerifyOtp from "../pages/Verify";
import Database from "../pages/Database";
import ControlTower from "../pages/ControlTower/index";
import AlertSetting from "../pages/AlertSetting";
import RefillLog from "../pages/RefillLog";
import ReportsPage from "../pages/Reports";
import UsersPage from "../pages/Users";
import InviteSignup from "../pages/InviteSignup";
import EmbryoGradingPage from "../pages/EmbryoGrading";
import EmbryoGradingDetailPage from "../pages/EmbryoGrading/EmbryoGradingDetailPage";
import AdvancedEmbryoGradingPage from "../pages/EmbryoGrading/AdvancedToolPage";
import EmbryoComparePage from "../pages/EmbryoGrading/EmbryoComparePage";
import EmbryoReportsPage from "../pages/EmbryoGrading/EmbryoReportsPage";
import EmbryoShell from "../pages/EmbryoGrading/EmbryoShell";
import IncubatorTrackingDashboardPage from "../pages/IncubatorTracking";
import IncubatorDetailPage from "../pages/IncubatorTracking/IncubatorDetailPage";
import RefrigeratorTrackingPage from "../pages/RefrigeratorTracking";
import RefrigeratorSelectionPage from "../pages/RefrigeratorTracking/RefrigeratorSelectionPage";
import SidebarLayout from "../components/SidebarLayout";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import SuccessAlert from "../pages/SuccessAlert";
import { RoleBasedRoute } from "../components/RoleBasedRoute";
import { AuthRedirect } from "../components/AuthRedirect";
import { VariantRoute } from "../components/VariantRoute";
import { OnboardingGate } from "../components/OnboardingGate";
import {
    OnboardingLevel,
    OnboardingShell,
} from "../pages/Onboarding";
import OnboardingSuccess from "../pages/Onboarding/OnboardingSuccess";
import Dashboard from "../pages/Dashboard";
import { OnboardingProvider, useOnboarding } from "../contexts/OnboardingContext";
import { useTourNavContext } from "../contexts/TourNavContext";

// Renders whichever level is currently active — works on any page.
// Prevents two OnboardingLevel instances from fighting over the shared tour instance.
// A preview session (launched from a real page's TourEntryButton) always mounts its
// level; otherwise prioritise pendingStartLevelId so Start/Resume mounts the right one.
function ActiveOnboardingLevel() {
    const { levels, state } = useOnboarding();
    const tourNavCtx = useTourNavContext();

    const previewId = tourNavCtx?.previewLevelId;
    const pendingId = tourNavCtx?.pendingStartLevelId;

    // A preview session mounts its tour directly by id — page tours are not in the
    // gamified `levels` list, so mount previewId as-is rather than looking it up.
    if (previewId) return <OnboardingLevel levelId={previewId} />;

    const active = pendingId
        ? (levels.find((l) => l.id === pendingId) ?? null)
        : (
            levels.find((l) => state.levels[l.id]?.status === "in_progress") ??
            levels.find((l) => state.levels[l.id]?.status === "available") ??
            null
        );

    if (!active) return null;
    return <OnboardingLevel levelId={active.id} />;
}

/**
 * Dashboard with variant support
 * If the user's hospital has a custom Dashboard variant, it will be rendered.
 * Otherwise, the default Dashboard component is used.
 */
const DashboardWithVariant = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]}>
        <VariantRoute
            routePath="/dashboard"
            defaultComponent={<Dashboard />}
        />
    </RoleBasedRoute>
);

/**
 * Database with role-based access
 * No variant support needed for this route currently
 */
const DatabaseWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={true}>
        <Database />
    </RoleBasedRoute>
);

/**
 * Control Tower with variant support
 * Hospitals can have custom Control Tower layouts
 */
const ControlTowerWithVariant = () => (
    <RoleBasedRoute
        restrictedRoles={["mygrape_admin"]}
        requireControlTower={true}
    >
        <VariantRoute
            routePath="/control-tower"
            defaultComponent={<ControlTower />}
        />
    </RoleBasedRoute>
);

/**
 * Refill Log page with role-based access
 */
const RefillLogWithAuth = () => (
    <RoleBasedRoute
        restrictedRoles={["mygrape_admin"]}
    >
        <RefillLog />
    </RoleBasedRoute>
);

/**
 * Track page with variant support
 * Supports parameterized route /track/:patientId
 * Hospitals can have custom tracking UIs
 */
const TrackPageWithVariant = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={true}>
        <VariantRoute
            routePath="/track/:patientId"
            defaultComponent={<TrackPage />}
        />
    </RoleBasedRoute>
);

/**
 * IVF Track Shipment search page (no tank ID)
 */
const IVFTrackShipmentWithVariant = () => (
    <RoleBasedRoute
        restrictedRoles={["mygrape_admin"]}
        restrictIVFAdmin={false}
    >
        <IVFTrackShipmentSearchPage />
    </RoleBasedRoute>
);

/**
 * IVF Track Shipment with tank ID parameter
 */
const IVFTrackShipmentWithTankVariant = () => (
    <RoleBasedRoute
        restrictedRoles={["mygrape_admin"]}
        restrictIVFAdmin={false}
    >
        <VariantRoute
            routePath="/cryocan-tracking/:tankId"
            defaultComponent={<IVFTrackShipmentPage />}
        />
    </RoleBasedRoute>
);

/**
 * Outbound Quality Tracking with variant support
 */
const OutboundQualityTrackingWithVariant = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={true}>
        <VariantRoute
            routePath="/outbound-quality-tracking"
            defaultComponent={<OutboundQualityTrackingPage />}
        />
    </RoleBasedRoute>
);

/**
 * Outbound Quality Tracking with canister ID parameter
 */
const OutboundQualityTrackingWithCanisterVariant = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={true}>
        <VariantRoute
            routePath="/outbound-quality-tracking/:canisterId"
            defaultComponent={<OutboundQualityTrackingPage />}
        />
    </RoleBasedRoute>
);

/**
 * Embryo Grading - IVF page
 */
const EmbryoGradingWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <EmbryoGradingPage />
    </RoleBasedRoute>
);

const EmbryoShellWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <EmbryoShell />
    </RoleBasedRoute>
);

/**
 * Incubator Tracking dashboard - list of incubator cards
 */
const IncubatorTrackingWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <IncubatorTrackingDashboardPage />
    </RoleBasedRoute>
);

/**
 * Incubator detail page - /incubator-tracking/:id (like cryocan-tracking/:tankId)
 */
const IncubatorDetailWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <IncubatorDetailPage />
    </RoleBasedRoute>
);

const RefrigeratorTrackingWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <VariantRoute
            routePath="/refrigerator-tracking/:refrigeratorId"
            defaultComponent={<RefrigeratorTrackingPage />}
        />
    </RoleBasedRoute>
);

/**
 * Refrigerator selection page - /refrigerator-tracking (list of all refrigerators)
 */
const RefrigeratorSelectionWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <RefrigeratorSelectionPage />
    </RoleBasedRoute>
);

/**
 * Alert Setting with role-based access
 * IVF Admins, Managers, and Users can access this
 */
const AlertSettingWithAuth = () => (
    <RoleBasedRoute allowedRoles={["Manager", "Admin", "User"]}>
        <VariantRoute
            routePath="/alert-setting"
            defaultComponent={<AlertSetting />}
        />
    </RoleBasedRoute>
);

/**
 * Application Router Configuration
 *
 * Routes are organized into categories:
 * 1. Public routes (no auth required)
 * 2. Auth routes (login, signup, password reset)
 * 3. Protected routes with variant support
 * 4. Protected routes without variant support
 *
 * ADDING VARIANT SUPPORT TO A ROUTE:
 * 1. Wrap the component with <VariantRoute>
 * 2. Set routePath to match the route pattern
 * 3. Set defaultComponent to the default page component
 * 4. Loader is shown until variant is ready (no default flash)
 *
 * CREATING A VARIANT:
 * 1. Create component in src/variants/hospital-{id}/{ComponentName}.tsx
 * 2. Add database mapping: INSERT INTO ui_route_variants
 *    (hospital_id, route_path, component_key) VALUES (id, '/route', 'ComponentNameHospital{id}')
 */
export const router = createBrowserRouter([
    // ============================================================
    // PUBLIC / AUTH ROUTES (No variant support needed)
    // ============================================================
    { path: "/", element: <AuthRedirect /> },
    { path: "/login", element: <Login /> },
    { path: "/invite", element: <InviteSignup /> },
    // { path: "/signup", element: <Signup /> },
    { path: "/verify-otp", element: <VerifyOtp /> },
    { path: "/forgot-password", element: <ForgotPassword /> },
    { path: "/reset-password", element: <ResetPassword /> },
    { path: "/success", element: <SuccessAlert /> },

    // ============================================================
    // ONBOARDING ROUTES
    // ============================================================
    {
        path: "/onboarding",
        element: (
            <OnboardingGate>
                <OnboardingProvider>
                    <OnboardingShell />
                </OnboardingProvider>
            </OnboardingGate>
        ),
        children: [
            { path: "/onboarding",               element: <Navigate to="/onboarding/dashboard" replace /> },
            // Playground routes — level tours run on top of these as invisible overlays
            { path: "/onboarding/dashboard",     element: <><Dashboard /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/control-tower", element: <><ControlTower /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/cryocan-tracking",                      element: <><IVFTrackShipmentSearchPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/cryocan-tracking/:tankId",              element: <><IVFTrackShipmentPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/alert-setting",                         element: <><AlertSetting /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/reports",                               element: <><ReportsPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/refill-log",                            element: <><RefillLog /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/user-profile",                          element: <><UserProfilePage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/support",                               element: <><Support /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/success",                               element: <><OnboardingSuccess /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/users",                                 element: <><UsersPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/embryo-console",                        element: <><EmbryoGradingPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/embryo-console/:his/ai-grading",        element: <><AdvancedEmbryoGradingPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/incubator-tracking",                    element: <><IncubatorTrackingDashboardPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/incubator-tracking/:id",                element: <><IncubatorDetailPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/track/:patientId",                      element: <><TrackPage /><ActiveOnboardingLevel /></> },
            { path: "/onboarding/database",                               element: <><Database /><ActiveOnboardingLevel /></> },
            // Catch-all: any unknown /onboarding/* path → dashboard
            { path: "/onboarding/*",             element: <Navigate to="/onboarding/dashboard" replace /> },
        ],
    },

    // ============================================================
    // PROTECTED ROUTES WITH SHARED APP LAYOUT
    // ============================================================
    {
        element: <SidebarLayout />,
        children: [
            { path: "/dashboard", element: <DashboardWithVariant /> },
            { path: "/control-tower", element: <ControlTowerWithVariant /> },
            { path: "/track/:patientId", element: <TrackPageWithVariant /> },
            { path: "/cryocan-tracking/:tankId", element: <IVFTrackShipmentWithTankVariant /> },
            { path: "/cryocan-tracking", element: <IVFTrackShipmentWithVariant /> },
            { path: "/outbound-quality-tracking/:canisterId", element: <OutboundQualityTrackingWithCanisterVariant /> },
            { path: "/outbound-quality-tracking", element: <OutboundQualityTrackingWithVariant /> },
            { path: "/alert-setting", element: <AlertSettingWithAuth /> },
            { path: "/refill-log", element: <RefillLogWithAuth /> },
            { path: "/embryo-console", element: <EmbryoGradingWithAuth /> },
            {
                path: "/embryo-console/:his",
                element: <EmbryoShellWithAuth />,
                children: [
                    { index: true,         element: <EmbryoGradingDetailPage /> },
                    { path: "ai-grading",  element: <AdvancedEmbryoGradingPage /> },
                    { path: "compare",     element: <EmbryoComparePage /> },
                    { path: "reports",     element: <EmbryoReportsPage /> },
                ],
            },
            { path: "/incubator-tracking/:id", element: <IncubatorDetailWithAuth /> },
            { path: "/incubator-tracking", element: <IncubatorTrackingWithAuth /> },
            { path: "/refrigerator-tracking/:refrigeratorId", element: <RefrigeratorTrackingWithAuth /> },
            { path: "/refrigerator-tracking", element: <RefrigeratorSelectionWithAuth /> },
            { path: "/database", element: <DatabaseWithAuth /> },
            {
                path: "/reports",
                element: (
                    <RoleBasedRoute restrictedRoles={["mygrape_admin"]}>
                        <ReportsPage />
                    </RoleBasedRoute>
                ),
            },
            {
                path: "/users",
                element: (
                    <RoleBasedRoute allowedRoles={["Admin", "Manager"]}>
                        <UsersPage />
                    </RoleBasedRoute>
                ),
            },
            {
                path: "/user-profile",
                element: (
                    <RoleBasedRoute>
                        <UserProfilePage />
                    </RoleBasedRoute>
                ),
            },
            {
                path: "/support",
                element: (
                    <RoleBasedRoute>
                        <Support />
                    </RoleBasedRoute>
                ),
            },
        ],
    },

    // ============================================================
    // PROTECTED ROUTES WITHOUT SHARED SIDEBAR
    // ============================================================
    { path: "/track-and-trace", element: <TrackAndTrace /> },

    // ============================================================
    // FALLBACK ROUTE
    // ============================================================
    { path: "*", element: <NotFound /> },
]);

export default router;
