import { createBrowserRouter } from 'react-router-dom'
import Login from '../pages/Login'
import Signup from '../pages/Signup'
import TrackAndTrace from '../pages/TrackAndTrace'
import TrackPage from '../pages/Track'
import IVFTrackShipmentPage from '../pages/IVFTrackShipment'
import OutboundQualityTrackingPage from '../pages/OutboundQualityTracking'
import UserProfilePage from '../pages/UserProfilePage'
import Support from '../pages/Support'
import NotFound from '../pages/NotFound'
import VerifyOtp from '../pages/Verify'
import Dashboard from '../pages/Dashboard'
import Database from '../pages/Database'
import ControlTower from '../pages/ControlTower/index'
import AlertSetting from '../pages/AlertSetting'
import { ApprovalLayout } from '../components/ApprovalLayout'
import ForgotPassword from '../pages/ForgotPassword'
import ResetPassword from '../pages/ResetPassword'
import SuccessAlert from '../pages/SuccessAlert'
import { RoleBasedRoute } from '../components/RoleBasedRoute'
import { AuthRedirect } from '../components/AuthRedirect'

// Wrapper components to ensure context is available
const DashboardWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']}>
    <Dashboard />
  </RoleBasedRoute>
)

const DatabaseWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']} restrictIVFAdmin={true}>
    <Database />
  </RoleBasedRoute>
)

const ControlTowerWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']} requireControlTower={true}>
    <ControlTower />
  </RoleBasedRoute>
)

const TrackPageWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']} restrictIVFAdmin={true}>
    <TrackPage />
  </RoleBasedRoute>
)

const IVFTrackShipmentWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']} restrictIVFAdmin={true}>
    <IVFTrackShipmentPage />
  </RoleBasedRoute>
)

const OutboundQualityTrackingWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']} restrictIVFAdmin={true}>
    <OutboundQualityTrackingPage />
  </RoleBasedRoute>
)

const AlertSettingWithAuth = () => (
  <RoleBasedRoute allowedRoles={['Manager', 'Admin']}>
    <AlertSetting />
  </RoleBasedRoute>
)

export const router = createBrowserRouter([
  { path: '/', element: <AuthRedirect /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  { path: '/track-and-trace', element: <TrackAndTrace /> },
  { path: '/user-profile', element: <UserProfilePage /> },
  { path: '/support', element: <Support /> },
  { path: '/success', element: <SuccessAlert /> },
  { path: '/verify-otp', element: <VerifyOtp /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/dashboard', element: <DashboardWithAuth /> },
  { path: '/database', element: <DatabaseWithAuth /> },
  { path: '/control-tower', element: <ControlTowerWithAuth /> },
  { path: '/track/:patientId', element: <TrackPageWithAuth /> },
  { path: '/ivf-track-shipment/:canisterId', element: <IVFTrackShipmentWithAuth /> },
  { path: '/ivf-track-shipment', element: <IVFTrackShipmentWithAuth /> },
  { path: '/outbound-quality-tracking/:canisterId', element: <OutboundQualityTrackingWithAuth /> },
  { path: '/outbound-quality-tracking', element: <OutboundQualityTrackingWithAuth /> },
  { path: '/approval', element: <ApprovalLayout /> },
  { path: '/approval-screen', element: <ApprovalLayout /> },
  { path: '/alert-setting', element: <AlertSettingWithAuth /> },
  { path: '*', element: <NotFound /> },
])

export default router
