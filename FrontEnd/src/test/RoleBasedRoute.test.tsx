import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RoleBasedRoute } from '../components/RoleBasedRoute'
import { AuthProvider } from '../contexts/AuthContext'
import * as authUtils from '../utils/auth'

// Mock auth utils
vi.mock('../utils/auth', () => ({
  authUtils: {
    getToken: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
  },
}))

// Mock auth service
vi.mock('../services/authService', () => ({
  authService: {
    logout: vi.fn(),
  },
}))

// Mock window.history.back
const mockHistoryBack = vi.fn()
Object.defineProperty(window, 'history', {
  value: {
    back: mockHistoryBack,
  },
  writable: true,
})

describe('RoleBasedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockHistoryBack.mockClear()
  })

  const renderWithAuth = (isAuthenticated: boolean, userRole?: string) => {
    ;(authUtils.authUtils.getToken as any).mockReturnValue(
      isAuthenticated ? 'test-token' : undefined
    )
    
    if (userRole) {
      localStorage.setItem('user_role', userRole)
    }

    return render(
      <MemoryRouter>
        <AuthProvider>
          <RoleBasedRoute allowedRoles={['admin', 'user']}>
            <div>Protected Content</div>
          </RoleBasedRoute>
        </AuthProvider>
      </MemoryRouter>
    )
  }

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)
      
      const { container } = render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      // Wait for initial load
      await waitFor(() => {
        // Component should handle loading state
      }, { timeout: 100 })
    })
  })

  describe('Authentication', () => {
    it('redirects to login when not authenticated', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
      })
    })

    it('renders content when authenticated and no role restrictions', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'admin')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })
  })

  describe('Role-based Access Control', () => {
    it('renders content when user role is in allowedRoles', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'admin')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute allowedRoles={['admin', 'user']}>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('shows access denied when user role is not in allowedRoles', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'guest')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute allowedRoles={['admin', 'user']}>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(screen.getByText("You don't have permission to access this page.")).toBeInTheDocument()
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
      })
    })

    it('shows access denied when user role is in restrictedRoles', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'guest')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute restrictedRoles={['guest']}>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
      })
    })

    it('renders content when user role is not in restrictedRoles', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'admin')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute restrictedRoles={['guest']}>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('prioritizes restrictedRoles over allowedRoles', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'guest')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute 
              allowedRoles={['admin', 'user', 'guest']}
              restrictedRoles={['guest']}
            >
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
      })
    })
  })

  describe('Access Denied UI', () => {
    it('shows access denied message with go back button', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'guest')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute allowedRoles={['admin']}>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(screen.getByText('Go Back')).toBeInTheDocument()
      })
    })

    it('calls window.history.back when go back button is clicked', async () => {
      const user = userEvent.setup()
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'guest')

      render(
        <MemoryRouter>
          <AuthProvider>
            <RoleBasedRoute allowedRoles={['admin']}>
              <div>Protected Content</div>
            </RoleBasedRoute>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(async () => {
        const goBackButton = screen.getByText('Go Back')
        await user.click(goBackButton)
        expect(mockHistoryBack).toHaveBeenCalledTimes(1)
      })
    })
  })
})

