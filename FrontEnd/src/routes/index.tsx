import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
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
import Dashboard from "../pages/Dashboard";
import { useCapabilities } from "../contexts/CapabilityContext";
import { FullPageLoader } from "../components/FullPageLoader";

// Refrigerator-only tenants get the bespoke hospital-8 experience, lazy-loaded so
// its 3D/WebGL bundle never ships to any other tenant.
const DashboardRefrigeratorOnly = lazy(() => import("../variants/hospital-8/Dashboard"));
const RefrigeratorTrackingRefrigeratorOnly = lazy(() => import("../variants/hospital-8/RefrigeratorTracking"));

/**
 * Dashboard — default for all tenants; refrigerator-only tenants get the hospital-8 dashboard.
 */
const DashboardWithVariant = () => {
    const { isRefrigeratorOnly } = useCapabilities();
    return (
        <RoleBasedRoute restrictedRoles={["mygrape_admin"]}>
            {isRefrigeratorOnly
                ? <Suspense fallback={<FullPageLoader />}><DashboardRefrigeratorOnly /></Suspense>
                : <Dashboard />}
        </RoleBasedRoute>
    );
};

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
        <ControlTower />
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
        <TrackPage />
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
        <IVFTrackShipmentPage />
    </RoleBasedRoute>
);

/**
 * Outbound Quality Tracking with variant support
 */
const OutboundQualityTrackingWithVariant = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={true}>
        <OutboundQualityTrackingPage />
    </RoleBasedRoute>
);

/**
 * Outbound Quality Tracking with canister ID parameter
 */
const OutboundQualityTrackingWithCanisterVariant = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={true}>
        <OutboundQualityTrackingPage />
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

const RefrigeratorTrackingWithAuth = () => {
    const { isRefrigeratorOnly } = useCapabilities();
    return (
        <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
            {isRefrigeratorOnly
                ? <Suspense fallback={<FullPageLoader />}><RefrigeratorTrackingRefrigeratorOnly /></Suspense>
                : <RefrigeratorTrackingPage />}
        </RoleBasedRoute>
    );
};

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
        <AlertSetting />
    </RoleBasedRoute>
);

/**
 * Application Router Configuration
 *
 * Routes are organized into:
 * 1. Public / auth routes (no auth required)
 * 2. Protected routes behind the shared app layout
 *
 * Tenant differences are driven by capability flags (see useCapabilities) — e.g.
 * refrigerator-only tenants get the hospital-8 dashboard/sidebar — not by a
 * per-hospital variant registry.
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
