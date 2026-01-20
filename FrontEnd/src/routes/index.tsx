import { createBrowserRouter } from 'react-router-dom'
import Login from '../pages/Login'
import Signup from '../pages/Signup'
import TrackAndTrace from '../pages/TrackAndTrace'
import TrackPage from '../pages/Track'
import IVFTrackShipmentPage from '../pages/IVFTrackShipment'
import UserProfilePage from '../pages/UserProfilePage'
import Support from '../pages/Support'
import NotFound from '../pages/NotFound'
import VerifyOtp from '../pages/Verify'
import Dashboard from '../pages/Dashboard'
import Database from '../pages/Database'
import ControlTower from '../pages/ControlTower/index'
import ApprovalScreen from '../pages/ApprovalScreen'
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
  <RoleBasedRoute restrictedRoles={['mygrape_admin']}>
    <Database />
  </RoleBasedRoute>
)

const ControlTowerWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']}>
    <ControlTower />
  </RoleBasedRoute>
)

const TrackPageWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']}>
    <TrackPage />
  </RoleBasedRoute>
)

const IVFTrackShipmentWithAuth = () => (
  <RoleBasedRoute restrictedRoles={['mygrape_admin']}>
    <IVFTrackShipmentPage />
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
  { path: '/ivf-track-shipment/:patientId', element: <IVFTrackShipmentWithAuth /> },
  { path: '/ivf-track-shipment', element: <IVFTrackShipmentWithAuth /> },
  { path: '/approval-screen', element: <ApprovalScreen /> },
  { path: '*', element: <NotFound /> },
])

export default router
