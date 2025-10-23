/**
 * Base API Service
 * Provides common functionality for all API services
 */

import { authUtils } from '../utils/auth';

export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  status?: string;
  error?: string;
}

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

export class BaseApiService {
  protected baseUrl: string;
  protected useMock: boolean;

  constructor() {
    // Get the API base URL from environment variables
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    this.baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    this.useMock = false; // Set to true for mock responses
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    const token = authUtils.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Make HTTP request with common error handling
   */
  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      // credentials: 'include', // Removed to fix CORS issue
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Make form data request (for file uploads)
   */
  protected async requestFormData<T>(
    endpoint: string,
    formData: FormData,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      // credentials: 'include', // Removed to fix CORS issue
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Make HTTP request without authentication headers
   */
  protected async unauthenticatedRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      // credentials: 'include', // Removed to fix CORS issue
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Set base URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Get current base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Set mock mode
   */
  setMockMode(useMock: boolean): void {
    this.useMock = useMock;
  }
}


