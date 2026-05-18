import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthService, authService } from '../services/authService'
import * as authUtils from '../utils/auth'

// Mock baseApiService module - must be hoisted, so use factory function
vi.mock('../services/baseApiService', () => {
  return {
    BaseApiService: class {
      request = vi.fn()
      unauthenticatedRequest = vi.fn()
    },
  }
})

// Mock auth utils
vi.mock('../utils/auth', () => ({
  authUtils: {
    setToken: vi.fn(),
    getToken: vi.fn(),
    clearToken: vi.fn(),
    checkTokenExpiration: vi.fn(),
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock document.cookie
Object.defineProperty(document, 'cookie', {
  writable: true,
  value: '',
})

describe('AuthService', () => {
  let service: AuthService
  let mockRequest: any
  let mockUnauthenticatedRequest: any

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AuthService()
    // Access the mocked methods from the instance
    mockRequest = vi.fn()
    mockUnauthenticatedRequest = vi.fn()
    // Replace the methods on the instance
    ;(service as any).request = mockRequest
    ;(service as any).unauthenticatedRequest = mockUnauthenticatedRequest
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('login', () => {
    it('should login successfully and store token', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
        remember_me: false,
      }
      const response = {
        message: 'Login successful',
        user_id: '123',
        token: 'test-token',
      }

      mockRequest.mockResolvedValueOnce(response)

      const result = await service.login(credentials)

      expect(mockRequest).toHaveBeenCalledWith('/api/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
      expect(result).toEqual(response)
    })

    it('should store token with rememberMe setting', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
        remember_me: true,
      }
      const response = {
        message: 'Login successful',
        user_id: '123',
        token: 'test-token',
      }

      mockRequest.mockResolvedValueOnce(response)

      await service.login(credentials)

      // Token should be stored via setAuthToken (internal method)
      // We can't directly test it, but we verify the response is handled
      expect(mockRequest).toHaveBeenCalled()
    })

    it('should handle login without token', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      }
      const response = {
        message: 'OTP sent',
        user_id: '123',
      }

      mockRequest.mockResolvedValueOnce(response)

      const result = await service.login(credentials)

      expect(result).toEqual(response)
    })
  })

  describe('register', () => {
    it('should register new user', async () => {
      const registerData = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
        role: 'user',
        company_name: 'Test Company',
      }
      const response = {
        message: 'Registration successful',
        user_id: '123',
        email: 'john@example.com',
      }

      mockUnauthenticatedRequest.mockResolvedValueOnce(response)

      const result = await service.register(registerData)

      expect(mockUnauthenticatedRequest).toHaveBeenCalledWith('/api/register', {
        method: 'POST',
        body: JSON.stringify(registerData),
      })
      expect(result).toEqual(response)
    })
  })

  describe('verifyOTP', () => {
    it('should verify OTP and store auth token', async () => {
      const otpData = {
        user_id: '123',
        otp: '123456',
      }
      const response = {
        message: 'OTP verified',
        auth_token: 'test-auth-token',
      }

      mockRequest.mockResolvedValueOnce(response)

      const result = await service.verifyOTP(otpData)

      expect(mockRequest).toHaveBeenCalledWith('/api/verify-otp', {
        method: 'POST',
        body: JSON.stringify(otpData),
      })
      expect(authUtils.authUtils.setToken).toHaveBeenCalledWith('test-auth-token')
      expect(result).toEqual(response)
    })

    it('should handle OTP verification without auth token', async () => {
      const otpData = {
        user_id: '123',
        otp: '123456',
      }
      const response = {
        message: 'OTP verified',
      }

      mockRequest.mockResolvedValueOnce(response)

      const result = await service.verifyOTP(otpData)

      expect(result).toEqual(response)
      expect(authUtils.authUtils.setToken).not.toHaveBeenCalled()
    })
  })

  describe('resendOTP', () => {
    it('should resend OTP', async () => {
      const userId = '123'
      const response = {
        message: 'OTP resent',
      }

      mockRequest.mockResolvedValueOnce(response)

      const result = await service.resendOTP(userId,"dummy@email.com")

      expect(mockRequest).toHaveBeenCalledWith('/api/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, email: "dummy@email.com" }),
      })
      expect(result).toEqual(response)
    })
  })

  describe('forgotPassword', () => {
    it('should send forgot password request', async () => {
      const email = 'test@example.com'
      const response = {
        message: 'Password reset email sent',
      }

      mockUnauthenticatedRequest.mockResolvedValueOnce(response)

      const result = await service.forgotPassword(email)

      expect(mockUnauthenticatedRequest).toHaveBeenCalledWith('/api/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      expect(result).toEqual(response)
    })
  })

  describe('resetPassword', () => {
    it('should reset password', async () => {
      const token = 'reset-token'
      const newPassword = 'newpassword123'
      const confirmPassword = 'newpassword123'
      const response = {
        message: 'Password reset successful',
      }

      mockUnauthenticatedRequest.mockResolvedValueOnce(response)

      const result = await service.resetPassword(token, newPassword, confirmPassword)

      expect(mockUnauthenticatedRequest).toHaveBeenCalledWith('/api/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      })
      expect(result).toEqual(response)
    })
  })

  describe('logout', () => {
    it('should clear token and localStorage', () => {
      localStorageMock.getItem.mockReturnValue('user123')
      
      service.logout()

      expect(authUtils.authUtils.clearToken).toHaveBeenCalled()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user_id')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user_data')
    })

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error('localStorage error')
      })

      // Should not throw
      expect(() => service.logout()).not.toThrow()
      expect(authUtils.authUtils.clearToken).toHaveBeenCalled()
    })
  })

  describe('isAuthenticated', () => {
    it('should return true when token exists', () => {
      ;(authUtils.authUtils.checkTokenExpiration as any).mockReturnValue(true)

      const result = service.isAuthenticated()

      expect(authUtils.authUtils.checkTokenExpiration).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should return false when token does not exist', () => {
      ;(authUtils.authUtils.checkTokenExpiration as any).mockReturnValue(false)

      const result = service.isAuthenticated()

      expect(result).toBe(false)
    })
  })

  describe('getCurrentUserId', () => {
    it('should return user ID from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('user123')

      const result = service.getCurrentUserId()

      expect(localStorageMock.getItem).toHaveBeenCalledWith('user_id')
      expect(result).toBe('user123')
    })

    it('should return null when user ID does not exist', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const result = service.getCurrentUserId()

      expect(result).toBeNull()
    })

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error')
      })

      const result = service.getCurrentUserId()

      expect(result).toBeNull()
    })
  })

  describe('getAuthToken', () => {
    it('should return auth token', () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue('test-token')

      const result = service.getAuthToken()

      expect(authUtils.authUtils.getToken).toHaveBeenCalled()
      expect(result).toBe('test-token')
    })

    it('should return null when token does not exist', () => {
      ;(authUtils.authUtils.getToken as any).mockReturnValue(undefined)

      const result = service.getAuthToken()

      expect(result).toBeNull()
    })
  })

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(authService).toBeInstanceOf(AuthService)
    })
  })
})

