import { createBrowserRouter } from 'react-router-dom'
import Login from '../pages/Login'
import Signup from '../pages/Signup'
import TrackAndTrace from '../pages/TrackAndTrace'
import UserProfilePage from '../pages/UserProfilePage'
import Support from '../pages/Support'
import NotFound from '../pages/NotFound'
import VerifyOtp from '../pages/Verify'
import Dashboard from '../pages/Dashboard'
import Database from '../pages/Database'
import ApprovalScreen from '../pages/ApprovalScreen'
import ForgotPassword from '../pages/ForgotPassword'
import ResetPassword from '../pages/ResetPassword'
import SuccessAlert from '../pages/SuccessAlert'
import { RoleBasedRoute } from '../components/RoleBasedRoute'

export const router = createBrowserRouter([
  { path: '/', element:<Login /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  { path: '/track-and-trace', element: <TrackAndTrace /> },
  { path: '/user-profile', element: <UserProfilePage /> },
  { path: '/support', element: <Support /> },
  { path: '/success', element: <SuccessAlert /> },
  { path: '/verify-otp', element: <VerifyOtp /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/dashboard', element: <RoleBasedRoute restrictedRoles={['admin']}><Dashboard /></RoleBasedRoute> },
  { path: '/database', element: <RoleBasedRoute restrictedRoles={['admin']}><Database /></RoleBasedRoute> },
  { path: '/approval-screen', element: <ApprovalScreen /> },
  { path: '*', element: <NotFound /> },
])

export default router
