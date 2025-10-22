/**
 * User Service
 * Handles all user-related API calls
 */

import { BaseApiService } from './baseApiService';

export interface UserProfileDto {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

export interface UserRegistration {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
  department: string;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface OTPVerification {
  user_id: string;
  otp: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
  confirm_password: string;
}

export interface UserApproval {
  user_id: string;
  action: 'approve' | 'reject';
}

export class UserService extends BaseApiService {
  /**
   * Get user profile
   */
  async getProfile(): Promise<UserProfileDto> {
    return await this.request<UserProfileDto>('/api/profile', {
      method: 'GET',
    });
  }

  /**
   * Register new user
   */
  async register(data: UserRegistration): Promise<{ message: string; user_id: string }> {
    return await this.request<{ message: string; user_id: string }>('/api/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Login user
   */
  async login(data: UserLogin): Promise<{ message: string; user_id: string; token: string }> {
    return await this.request<{ message: string; user_id: string; token: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Verify OTP
   */
  async verifyOTP(data: OTPVerification): Promise<{ message: string; user_id: string }> {
    return await this.request<{ message: string; user_id: string }>('/api/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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
  async forgotPassword(data: ForgotPasswordRequest): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Reset password
   */
  async resetPassword(data: ResetPasswordRequest): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get user by ID (admin/manager only)
   */
  async getUserById(userId: string): Promise<UserProfileDto> {
    return await this.request<UserProfileDto>(`/api/user/${encodeURIComponent(userId)}`, {
      method: 'GET',
    });
  }

  /**
   * Approve user (manager/admin only)
   */
  async approveUser(data: UserApproval): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/user/approve', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Reject user (manager/admin only)
   */
  async rejectUser(data: UserApproval): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/user/reject', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers(): Promise<UserProfileDto[]> {
    return await this.request<UserProfileDto[]>('/api/users', {
      method: 'GET',
    });
  }
}

// Export singleton instance
export const userService = new UserService();


