import { createBrowserRouter } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'
import Login from '../pages/Login'
import Signup from '../pages/Signup'
import TrackAndTrace from '../pages/TrackAndTrace'
import UserProfilePage from '../pages/UserProfilePage'
import Support from '../pages/Support'
import NotFound from '../pages/NotFound'

export const router = createBrowserRouter([
  { path: '/', element: <Dashboard /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  { path: '/track-and-trace', element: <TrackAndTrace /> },
  { path: '/user-profile', element: <UserProfilePage /> },
  { path: '/support', element: <Support /> },
  { path: '*', element: <NotFound /> },
])

export default router
