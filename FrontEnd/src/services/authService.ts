/**
 * Auth Service
 * Handles authentication-related API calls and token management
 */

import { BaseApiService } from './baseApiService';
import { authUtils } from '../utils/auth';

export interface LoginCredentials {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface RegisterData {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
  role: string;
  company_name?: string;
  department?: string;
  hospital_name?: string;
  branch_name?: string;
}

export interface HospitalInfoResponse {
  is_hospital_email: boolean;
  hospital_name: string | null;
  hospital_id: number | null;
  hospital_type: string | null;
  departments: string[];
  branches: Array<{
    branch_id: number;
    branch_name: string;
    district_name: string;
    state_name: string;
  }>;
}

export interface AuthResponse {
  message: string;
  user_id: string;
  token?: string;
  status?: string;
  email?: string;
  otp_expiry?: string;
  auth_token?: string;
  role?: string;
  // Extended fields from Verify OTP success response
  pharma_id?: number | null;
  hospital_id?: number | null;
  branch_id?: number | null;
  hospital_name?: string | null;
  department?: string | null;
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
      this.setAuthToken(response.token, credentials.remember_me || false);
    }

    return response;
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    return await this.unauthenticatedRequest<AuthResponse>('/api/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Verify OTP
   */
  async verifyOTP(data: OTPData, rememberMe: boolean = false): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Store token in cookie if provided
    if (response.auth_token) {
      authUtils.setToken(response.auth_token, rememberMe);
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
    return await this.unauthenticatedRequest<{ message: string }>('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Reset password
   */
  async resetPassword(token: string, newPassword: string, confirmPassword: string): Promise<{ message: string }> {
    return await this.unauthenticatedRequest<{ message: string }>('/api/reset-password', {
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
    authUtils.clearToken();
    // Clear any other auth-related data
    try {
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_data');
    } catch (error) {
      // Silently handle localStorage clearing errors
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return authUtils.checkTokenExpiration();
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
  private setAuthToken(token: string, rememberMe: boolean = false): void {
    try {
      if (typeof document !== 'undefined') {
        // Set expiration based on remember me setting
        // If remember me is true: 9 hours, if false: 1 hour
        const expirationHours = rememberMe ? 9 : 1;
        const maxAge = expirationHours * 60 * 60; // Convert hours to seconds
        
        document.cookie = `auth_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; secure; samesite=strict`;
      }
    } catch (error) {
      // Silently handle auth token setting errors
    }
  }

  /**
   * Clear auth token from cookie
   */
  private _clearAuthToken(): void {
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    } catch (error) {
      // Silently handle auth token clearing errors
    }
  }

  /**
   * Get auth token from cookie
   */
  getAuthToken(): string | null {
    return authUtils.getToken() || null;
  }

  /**
   * Get hospital info by email
   */
  async getHospitalInfoByEmail(email: string): Promise<HospitalInfoResponse> {
    const encodedEmail = encodeURIComponent(email);
    return await this.unauthenticatedRequest<HospitalInfoResponse>(`/api/hospital-info-by-email?email=${encodedEmail}`, {
      method: 'GET',
    });
  }
}

// Export singleton instance
export const authService = new AuthService();


