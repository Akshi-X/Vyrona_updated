import { createBrowserRouter } from "react-router-dom";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import TrackAndTrace from "../pages/TrackAndTrace";
import TrackPage from "../pages/Track";
import IVFTrackShipmentPage from "../pages/IVFTrackShipment";
import OutboundQualityTrackingPage from "../pages/OutboundQualityTracking";
import UserProfilePage from "../pages/UserProfilePage";
import Support from "../pages/Support";
import NotFound from "../pages/NotFound";
import VerifyOtp from "../pages/Verify";
import Dashboard from "../pages/Dashboard";
import Database from "../pages/Database";
import ControlTower from "../pages/ControlTower/index";
import AlertSetting from "../pages/AlertSetting";
import RefillLog from "../pages/RefillLog";
import ReportsPage from "../pages/Reports";
import EmbryoGradingPage from "../pages/EmbryoGrading";
import IncubatorTrackingDashboardPage from "../pages/IncubatorTracking";
import IncubatorDetailPage from "../pages/IncubatorTracking/IncubatorDetailPage";
import { ApprovalLayout } from "../components/ApprovalLayout";
import SidebarLayout from "../components/SidebarLayout";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import SuccessAlert from "../pages/SuccessAlert";
import { RoleBasedRoute } from "../components/RoleBasedRoute";
import { AuthRedirect } from "../components/AuthRedirect";
import { VariantRoute } from "../components/VariantRoute";

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
 * IVF Track Shipment with variant support
 */
const IVFTrackShipmentWithVariant = () => (
    <RoleBasedRoute
        restrictedRoles={["mygrape_admin"]}
        restrictIVFAdmin={false}
    >
        <VariantRoute
            routePath="/ivf-track-shipment"
            defaultComponent={<IVFTrackShipmentPage />}
        />
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
            routePath="/ivf-track-shipment/:tankId"
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

/**
 * Incubator Tracking dashboard - list of incubator cards
 */
const IncubatorTrackingWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <IncubatorTrackingDashboardPage />
    </RoleBasedRoute>
);

/**
 * Incubator detail page - /incubator-tracking/:id (like ivf-track-shipment/:tankId)
 */
const IncubatorDetailWithAuth = () => (
    <RoleBasedRoute restrictedRoles={["mygrape_admin"]} restrictIVFAdmin={false}>
        <IncubatorDetailPage />
    </RoleBasedRoute>
);

/**
 * Alert Setting with role-based access
 * Only Managers and Admins can access this
 */
const AlertSettingWithAuth = () => (
    <RoleBasedRoute allowedRoles={["Manager", "Admin"]}>
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
    { path: "/signup", element: <Signup /> },
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
            { path: "/ivf-track-shipment/:tankId", element: <IVFTrackShipmentWithTankVariant /> },
            { path: "/ivf-track-shipment", element: <IVFTrackShipmentWithVariant /> },
            { path: "/outbound-quality-tracking/:canisterId", element: <OutboundQualityTrackingWithCanisterVariant /> },
            { path: "/outbound-quality-tracking", element: <OutboundQualityTrackingWithVariant /> },
            { path: "/alert-setting", element: <AlertSettingWithAuth /> },
            { path: "/refill-log", element: <RefillLogWithAuth /> },
            { path: "/embryo-grading", element: <EmbryoGradingWithAuth /> },
            { path: "/embryo-grading/:his", element: <EmbryoGradingWithAuth /> },
            { path: "/incubator-tracking/:id", element: <IncubatorDetailWithAuth /> },
            { path: "/incubator-tracking", element: <IncubatorTrackingWithAuth /> },
            { path: "/database", element: <DatabaseWithAuth /> },
            {
                path: "/reports",
                element: (
                    <RoleBasedRoute restrictedRoles={["mygrape_admin"]}>
                        <ReportsPage />
                    </RoleBasedRoute>
                ),
            },
        ],
    },

    // ============================================================
    // PROTECTED ROUTES WITHOUT SHARED SIDEBAR
    // ============================================================
    { path: "/track-and-trace", element: <TrackAndTrace /> },
    { path: "/user-profile", element: <UserProfilePage /> },
    { path: "/support", element: <Support /> },
    { path: "/approval", element: <ApprovalLayout /> },
    { path: "/approval-screen", element: <ApprovalLayout /> },

    // ============================================================
    // FALLBACK ROUTE
    // ============================================================
    { path: "*", element: <NotFound /> },
]);

export default router;
