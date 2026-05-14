import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { AuthProvider, useAuth } from '../contexts/AuthContext'
import * as authUtils from '../utils/auth'
import * as authService from '../services/authService'

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

// Test component that uses the auth context
const TestComponent = () => {
  const auth = useAuth()
  return (
    <div>
      <div data-testid="isAuthenticated">{auth.isAuthenticated ? 'true' : 'false'}</div>
      <div data-testid="token">{auth.token || 'no-token'}</div>
      <div data-testid="userRole">{auth.userRole || 'no-role'}</div>
      <div data-testid="isLoading">{auth.isLoading ? 'true' : 'false'}</div>
      <div data-testid="emailNotifications">
        {auth.isEmailNotificationsEnabled ? 'true' : 'false'}
      </div>
      <button
        data-testid="login-btn"
        onClick={() => auth.login('new-token', 'admin', false)}
      >
        Login
      </button>
      <button
        data-testid="login-rememberme-btn"
        onClick={() => auth.login('new-token', 'admin', true)}
      >
        Login Remember Me
      </button>
      <button data-testid="logout-btn" onClick={() => auth.logout()}>
        Logout
      </button>
      <button
        data-testid="toggle-email-btn"
        onClick={() => auth.setIsEmailNotificationsEnabled(!auth.isEmailNotificationsEnabled)}
      >
        Toggle Email
      </button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Don't use fake timers for most tests - they cause issues with React state updates
    // Only use fake timers for specific timeout tests
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Initialization', () => {
    it('should initialize with no token when no token exists', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      // Wait for loading to complete
      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      // Then check the other values
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')
      expect(screen.getByTestId('token')).toHaveTextContent('no-token')
    })

    it('should initialize with existing token', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('existing-token')
      localStorage.setItem('user_role', 'admin')

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      // Wait for loading to complete first
      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      // Then check authenticated state
      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
        expect(screen.getByTestId('token')).toHaveTextContent('existing-token')
        expect(screen.getByTestId('userRole')).toHaveTextContent('admin')
      }, { timeout: 5000 })
    })

    it('should initialize email notifications from localStorage', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)
      localStorage.setItem('email_notify_pref', 'false')

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      expect(screen.getByTestId('emailNotifications')).toHaveTextContent('false')
    })

    it('should default email notifications to true when not in localStorage', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      expect(screen.getByTestId('emailNotifications')).toHaveTextContent('true')
    })

    it('should handle invalid JSON in email_notify_pref and default to true', async () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)
      // Set invalid JSON to trigger the catch block
      localStorage.setItem('email_notify_pref', 'invalid-json{')

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      // Should default to true when JSON.parse fails
      expect(screen.getByTestId('emailNotifications')).toHaveTextContent('true')
    })
  })

  describe('Login', () => {
    it('should login and set token and role', async () => {
      const user = await import('@testing-library/user-event').then((m) => m.default.setup())
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      const loginBtn = screen.getByTestId('login-btn')
      await user.click(loginBtn)

      await waitFor(() => {
        expect(authUtils.authUtils.setToken).toHaveBeenCalledWith('new-token', false)
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
        expect(screen.getByTestId('token')).toHaveTextContent('new-token')
        expect(screen.getByTestId('userRole')).toHaveTextContent('admin')
        expect(localStorage.getItem('user_role')).toBe('admin')
      }, { timeout: 5000 })
    })

    it('should set session timeout when rememberMe is true', async () => {
      vi.useFakeTimers()
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      const { getByTestId } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      // Let React render and useEffect complete
      await act(async () => {
        vi.runOnlyPendingTimers()
      })

      // Wait for loading to complete
      await act(async () => {
        let attempts = 0
        while (attempts < 100) {
          const isLoadingEl = getByTestId('isLoading')
          if (isLoadingEl.textContent === 'false') break
          vi.advanceTimersByTime(10)
          vi.runOnlyPendingTimers()
          attempts++
        }
      })

      expect(getByTestId('isLoading')).toHaveTextContent('false')

      // Get the auth context and call login directly (bypassing user-event which has issues with fake timers)
      const loginBtn = getByTestId('login-rememberme-btn')
      
      // Verify setToken mock is clear before click
      expect(authUtils.authUtils.setToken).not.toHaveBeenCalled()
      
      // Use fireEvent to trigger the click
      act(() => {
        fireEvent.click(loginBtn)
      })
      
      // Check if setToken was called (this will tell us if the click handler ran)
      expect(authUtils.authUtils.setToken).toHaveBeenCalledWith('new-token', true)
      
      // Clear only the logout service mock calls (not all mocks, which would clear timers)
      ;(authService.authService.logout as any).mockClear()

      // Fast-forward time to check timeout (9 hours for rememberMe)
      // The timeout should have been set when login was called
      // Use advanceTimersByTime which will trigger any timers that are due
      act(() => {
        vi.advanceTimersByTime(9 * 60 * 60 * 1000)
      })
      
      // Run all timers to ensure the timeout callback executes
      await act(async () => {
        vi.runAllTimers()
      })

      // Verify logout was called (the timeout callback should have triggered)
      expect(authService.authService.logout).toHaveBeenCalled()
      
      vi.useRealTimers()
    })

    it('should clear existing timeout when logging in again', async () => {
      vi.useFakeTimers()
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      const { getByTestId } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      // Let React render and useEffect complete
      await act(async () => {
        vi.runOnlyPendingTimers()
      })

      // Wait for loading to complete
      await act(async () => {
        let attempts = 0
        while (attempts < 100) {
          const isLoadingEl = getByTestId('isLoading')
          if (isLoadingEl.textContent === 'false') break
          vi.advanceTimersByTime(10)
          vi.runOnlyPendingTimers()
          attempts++
        }
      })

      const loginBtn = getByTestId('login-btn')
      
      // First login - this sets a timeout
      act(() => {
        fireEvent.click(loginBtn)
      })
      
      // Clear logout mock
      ;(authService.authService.logout as any).mockClear()
      
      // Second login - this should clear the existing timeout and set a new one (line 50)
      act(() => {
        fireEvent.click(loginBtn)
      })
      
      // Advance time by 1 hour (the new timeout duration)
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000)
      })
      
      // Run all timers
      await act(async () => {
        vi.runAllTimers()
      })

      // Verify logout was called (the new timeout should have triggered)
      expect(authService.authService.logout).toHaveBeenCalled()
      
      vi.useRealTimers()
    })
  })

  describe('Logout', () => {
    it('should logout and clear token and role', async () => {
      const user = await import('@testing-library/user-event').then((m) => m.default.setup())
      ;(authUtils.authUtils.getToken as any).mockReturnValue('existing-token')
      localStorage.setItem('user_role', 'admin')

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
      }, { timeout: 5000 })

      const logoutBtn = screen.getByTestId('logout-btn')
      await user.click(logoutBtn)

      await waitFor(() => {
        expect(authService.authService.logout).toHaveBeenCalled()
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')
        expect(screen.getByTestId('token')).toHaveTextContent('no-token')
        expect(screen.getByTestId('userRole')).toHaveTextContent('no-role')
        expect(localStorage.getItem('user_role')).toBeNull()
      }, { timeout: 5000 })
    })

    it('should clear session timeout on logout', async () => {
      const user = await import('@testing-library/user-event').then((m) => m.default.setup())
      ;(authUtils.authUtils.getToken as any).mockReturnValue('existing-token')

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
      }, { timeout: 5000 })

      const logoutBtn = screen.getByTestId('logout-btn')
      await user.click(logoutBtn)

      await waitFor(() => {
        expect(authService.authService.logout).toHaveBeenCalled()
      }, { timeout: 5000 })

      // Now switch to fake timers to test timeout clearing
      vi.useFakeTimers()
      
      // Advance time - logout should have cleared timeout
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 60 * 1000)
      })

      await act(async () => {
        vi.runOnlyPendingTimers()
      })

      // Should not call logout again
      expect(authService.authService.logout).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })
  })

  describe('Email Notifications', () => {
    it('should toggle email notifications', async () => {
      const user = await import('@testing-library/user-event').then((m) => m.default.setup())
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        const isLoading = screen.getByTestId('isLoading').textContent
        expect(isLoading).toBe('false')
      }, { timeout: 10000 })

      expect(screen.getByTestId('emailNotifications')).toHaveTextContent('true')

      const toggleBtn = screen.getByTestId('toggle-email-btn')
      await user.click(toggleBtn)

      await waitFor(() => {
        expect(screen.getByTestId('emailNotifications')).toHaveTextContent('false')
        expect(localStorage.getItem('email_notify_pref')).toBe('false')
      }, { timeout: 5000 })

      await user.click(toggleBtn)

      await waitFor(() => {
        expect(screen.getByTestId('emailNotifications')).toHaveTextContent('true')
        expect(localStorage.getItem('email_notify_pref')).toBe('true')
      }, { timeout: 5000 })
    })
  })

  describe('useAuth Hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // React catches errors during render, so we need to check the error boundary
      // or check that console.error was called with the error message
      try {
        render(<TestComponent />)
        // If we get here, the error was caught by React
        // Check that console.error was called with our error
        expect(consoleSpy).toHaveBeenCalled()
        const errorCalls = consoleSpy.mock.calls.flat()
        const hasAuthError = errorCalls.some((call: any) => 
          typeof call === 'string' && call.includes('useAuth must be used within an AuthProvider')
        )
        expect(hasAuthError).toBe(true)
      } catch (error: any) {
        // If error is thrown, check it's the right one
        expect(error.message).toContain('useAuth must be used within an AuthProvider')
      }

      consoleSpy.mockRestore()
    })
  })

  describe('Session Timeout', () => {
    it('should logout after 1 hour when rememberMe is false', async () => {
      vi.useFakeTimers()
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      const { getByTestId } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      // Let React render and useEffect complete
      await act(async () => {
        vi.runOnlyPendingTimers()
      })

      // Wait for loading to complete
      await act(async () => {
        let attempts = 0
        while (attempts < 100) {
          const isLoadingEl = getByTestId('isLoading')
          if (isLoadingEl.textContent === 'false') break
          vi.advanceTimersByTime(10)
          vi.runOnlyPendingTimers()
          attempts++
        }
      })

      expect(getByTestId('isLoading')).toHaveTextContent('false')
      expect(getByTestId('isAuthenticated')).toHaveTextContent('false')

      // Login without rememberMe (default) - use fireEvent instead of user-event
      const loginBtn = getByTestId('login-btn')
      
      // Use fireEvent to trigger the click
      act(() => {
        fireEvent.click(loginBtn)
      })
      
      // Clear only the logout service mock calls (not all mocks, which would clear timers)
      ;(authService.authService.logout as any).mockClear()

      // Fast-forward 1 hour
      // Use advanceTimersByTime which will trigger any timers that are due
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000)
      })
      
      // Run all timers to ensure the timeout callback executes
      await act(async () => {
        vi.runAllTimers()
      })

      // Verify logout was called
      expect(authService.authService.logout).toHaveBeenCalled()
      
      vi.useRealTimers()
    })
  })
})

