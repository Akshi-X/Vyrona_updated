import { createBrowserRouter } from 'react-router-dom'
import Login from '../pages/Login'
import Signup from '../pages/Signup'
import TrackAndTrace from '../pages/TrackAndTrace'
import NotFound from '../pages/NotFound'
import VerifyOtp from '../pages/Verify'
import Dashboard from '../pages/Dashboard'
import ApprovalScreen from '../pages/ApprovalScreen'
import ForgotPassword from '../pages/ForgotPassword'

export const router = createBrowserRouter([
  { path: '/', element:<Login /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  { path: '/track-and-trace', element: <TrackAndTrace /> },
  { path: '*', element: <NotFound /> },
  { path: '/verify-otp', element: <VerifyOtp /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/approval-screen', element: <ApprovalScreen /> },
  { path: '*', element: <NotFound /> },
])

export default router
