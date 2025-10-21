/**
 * Auth Service
 * Handles authentication-related API calls and token management
 */

import { BaseApiService } from './baseApiService';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
  department: string;
}

export interface AuthResponse {
  message: string;
  user_id: string;
  token?: string;
}

export interface OTPData {
  user_id: string;
  otp: string;
}

export class AuthService extends BaseApiService {
  /**
   * Login user
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    // Store token in cookie if provided
    if (response.token) {
      this.setAuthToken(response.token);
    }

    return response;
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    return await this.request<AuthResponse>('/api/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Verify OTP
   */
  async verifyOTP(data: OTPData): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Store token in cookie if provided
    if (response.token) {
      this.setAuthToken(response.token);
    }

    return response;
  }

  /**
   * Resend OTP
   */
  async resendOTP(userId: string): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  /**
   * Forgot password
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Reset password
   */
  async resetPassword(token: string, newPassword: string, confirmPassword: string): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });
  }

  /**
   * Logout user
   */
  logout(): void {
    this.clearAuthToken();
    // Clear any other auth-related data
    try {
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_data');
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    try {
      const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/) : null;
      return !!match;
    } catch {
      return false;
    }
  }

  /**
   * Get current user ID from localStorage
   */
  getCurrentUserId(): string | null {
    try {
      return localStorage.getItem('user_id');
    } catch {
      return null;
    }
  }

  /**
   * Set auth token in cookie
   */
  private setAuthToken(token: string): void {
    try {
      if (typeof document !== 'undefined') {
        document.cookie = `auth_token=${encodeURIComponent(token)}; path=/; max-age=86400; secure; samesite=strict`;
      }
    } catch (error) {
      console.warn('Failed to set auth token:', error);
    }
  }

  /**
   * Clear auth token from cookie
   */
  private clearAuthToken(): void {
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    } catch (error) {
      console.warn('Failed to clear auth token:', error);
    }
  }

  /**
   * Get auth token from cookie
   */
  getAuthToken(): string | null {
    try {
      const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/) : null;
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();


