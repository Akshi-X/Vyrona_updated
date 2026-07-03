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
  phone_number?: string | null;
  company_name: string | null;
  pharma_id?: number | null;
  hospital_id?: number | null;
  branch_id?: number | null;
  department?: string | null;
  approved_status: string;
  status: boolean;
  is_locked: boolean;
  login_attempts: number;
  last_login: string;
  session_timeout: number;
  onboarding_completed: boolean;
}

export interface UserListItem {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  pharma_id?: number;
  company_name?: string;
}

export interface HospitalUserItem {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  branch_name?: string | null;
  department?: string | null;
  status: boolean;
  approved_status: string;
  invite_pending: boolean;
  last_login?: string | null;
}

export interface HospitalUserListResponse {
  total_users: number;
  users: HospitalUserItem[];
}

export interface UserListResponse {
  total_users: number;
  users: UserListItem[];
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


export class UserService extends BaseApiService {
  /**
   * Get user profile
   */
  async getProfile(): Promise<UserProfileDto> {
    return await this.request<UserProfileDto>('/api/profile', {
      method: 'GET',
    });
  }

  async getProfileForOnboarding(): Promise<UserProfileDto> {
    return await this.request<UserProfileDto>('/api/profile', {
      method: 'GET',
      skipMock: true,
    });
  }

  /**
   * Update user profile (first name and last name)
   */
  async updateProfile(userId: string, data: { first_name: string; last_name: string; phone_number?: string | null }): Promise<{ message: string; user_id: string; first_name: string; last_name: string; phone_number?: string | null; updated_at: string }> {
    return await this.request<{ message: string; user_id: string; first_name: string; last_name: string; phone_number?: string | null; updated_at: string }>(`/api/user/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
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
   * Get all users in company (for mentions, dropdowns, etc.)
   */
  async getAllUsersInCompany(): Promise<UserListResponse> {
    return await this.request<UserListResponse>('/api/users', {
      method: 'GET',
    });
  }

  async getUsersByHospital(hospitalId: number): Promise<UserListResponse> {
    return await this.request<UserListResponse>(`/api/users?hospital_id=${hospitalId}`, {
      method: 'GET',
    });
  }

  async getHospitalUsers(): Promise<HospitalUserListResponse> {
    return await this.request<HospitalUserListResponse>('/api/hospital/users', {
      method: 'GET',
    });
  }

  async resendInvite(userId: string): Promise<{ message: string }> {
    return await this.request<{ message: string }>(`/api/hospital/users/${encodeURIComponent(userId)}/resend-invite`, {
      method: 'POST',
    });
  }

  async inviteHospitalUser(email: string, role: string, branch?: string): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/hospital/users/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role, branch_name: branch ?? null }),
    });
  }

  async updateHospitalUser(userId: string, data: { first_name: string; last_name: string; role: string; branch_name?: string | null }): Promise<{ message: string; user_id: string; first_name: string; last_name: string; role: string; branch_name?: string | null }> {
    return await this.request(`/api/hospital/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async setHospitalUserStatus(userId: string, status: boolean): Promise<{ message: string; user_id: string; status: boolean }> {
    return await this.request(`/api/hospital/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async getInviteToken(token: string): Promise<{ email: string; role: string; hospital_name: string | null; expires_at: string; branch_name: string | null } | null> {
    return await this.request(`/api/invite/${token}`, { method: 'GET' });
  }

  async registerFromInvite(data: { token: string; first_name: string; last_name: string; password: string; confirm_password: string }): Promise<{ message: string; user_id: string }> {
    return await this.request('/api/register/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

}

// Export singleton instance
export const userService = new UserService();


