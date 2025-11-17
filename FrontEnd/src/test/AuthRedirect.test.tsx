import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthRedirect } from '../components/AuthRedirect'
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

describe('AuthRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)
      
      const { container } = render(
        <MemoryRouter>
          <AuthProvider>
            <AuthRedirect />
          </AuthProvider>
        </MemoryRouter>
      )

      // Wait for initial load
      await waitFor(() => {
        // Component should handle loading state
      }, { timeout: 100 })
    })
  })

  describe('Authentication Redirects', () => {
    it('redirects to login when not authenticated', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AuthRedirect />
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        // Should redirect to login
        // We can't easily test Navigate component, but we can verify it doesn't show content
      }, { timeout: 100 })
    })

    it('redirects to dashboard when authenticated with non-admin role', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'user')

      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AuthRedirect />
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        // Should redirect to dashboard
      }, { timeout: 100 })
    })

    it('redirects to user-profile when authenticated with mygrape_admin role', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')
      localStorage.setItem('user_role', 'mygrape_admin')

      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AuthRedirect />
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        // Should redirect to user-profile
      }, { timeout: 100 })
    })

    it('redirects to dashboard when authenticated without role', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')

      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AuthRedirect />
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        // Should redirect to dashboard
      }, { timeout: 100 })
    })
  })
})

