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

export interface ApiRequestOptions extends RequestInit {
  skipMock?: boolean;
}

export class BaseApiService {
  protected baseUrl: string;
  protected useMock: boolean;
  private requestCache: Map<string, Promise<any>> = new Map();
  private static mockEnabled = false;
  private static mockResolver?: (endpoint: string, options: RequestInit) => any | undefined;

  constructor() {
    // Get the API base URL from environment variables
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    this.baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    this.useMock = false; // Set to true for mock responses
  }

  static setMockEnabled(enabled: boolean): void {
    BaseApiService.mockEnabled = enabled;
  }

  static setMockResolver(
    resolver?: (endpoint: string, options: RequestInit) => any | undefined,
  ): void {
    BaseApiService.mockResolver = resolver;
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
   * Make HTTP request with common error handling and deduplication
   */
  protected async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const { skipMock = false, ...requestOptions } = options;
    if (!skipMock && BaseApiService.mockEnabled && BaseApiService.mockResolver) {
      const mocked = await BaseApiService.mockResolver(endpoint, options);
      if (mocked !== undefined) {
        return mocked as T;
      }
    }
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = `${options.method || 'GET'}:${url}`;
    
    // Check if there's already a pending request for this endpoint
    if (this.requestCache.has(cacheKey)) {
      return this.requestCache.get(cacheKey)!;
    }

    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    const requestPromise = (async () => {
      try {
        const response = await fetch(url, {
          ...requestOptions,
          headers,
          // credentials: 'include', // Removed to fix CORS issue
        });

        if (!response.ok) {
          // Handle 401 Unauthorized - clear auth token and redirect to login
          // BUT NOT for authentication endpoints (to show error messages)
          if (response.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/verify-otp')) {
            authUtils.clearToken();
            // Clear any other auth-related data
            try {
              localStorage.removeItem('user_id');
              localStorage.removeItem('user_data');
            } catch (error) {
              // Silently handle localStorage clearing errors
            }
            // Optionally redirect to login page
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          }

          const errorText = await response.text();
          let errorMessage = `API Error: ${response.status}`;
          
          try {
            // Try to parse the error response as JSON
            const errorData = JSON.parse(errorText);
            if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = errorData.error;
            } else {
              errorMessage = errorText;
            }
          } catch {
            // If parsing fails, use the raw error text
            errorMessage = errorText;
          }
          
          throw new Error(errorMessage);
        }

        return await response.json();
      } finally {
        // Remove from cache when request completes (success or error)
        this.requestCache.delete(cacheKey);
      }
    })();

    // Cache the request promise
    this.requestCache.set(cacheKey, requestPromise);
    
    return requestPromise;
  }

  /**
   * Make form data request (for file uploads)
   */
  protected async requestFormData<T>(
    endpoint: string,
    formData: FormData,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const { skipMock = false, ...requestOptions } = options;
    if (!skipMock && BaseApiService.mockEnabled && BaseApiService.mockResolver) {
      const mocked = await BaseApiService.mockResolver(endpoint, options);
      if (mocked !== undefined) {
        return mocked as T;
      }
    }
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...requestOptions,
      headers,
      // credentials: 'include', // Removed to fix CORS issue
      body: formData,
    });

    if (!response.ok) {
      // Handle 401 Unauthorized - clear auth token and redirect to login
      if (response.status === 401) {
        authUtils.clearToken();
        // Clear any other auth-related data
        try {
          localStorage.removeItem('user_id');
          localStorage.removeItem('user_data');
        } catch (error) {
          // Silently handle localStorage clearing errors
        }
        // Optionally redirect to login page
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }

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
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const { skipMock = false, ...requestOptions } = options;
    if (!skipMock && BaseApiService.mockEnabled && BaseApiService.mockResolver) {
      const mocked = await BaseApiService.mockResolver(endpoint, options);
      if (mocked !== undefined) {
        return mocked as T;
      }
    }
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...requestOptions,
      headers,
      // credentials: 'include', // Removed to fix CORS issue
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API Error: ${response.status}`;
      
      try {
        // Try to parse the error response as JSON
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else {
          errorMessage = errorText;
        }
      } catch {
        // If parsing fails, use the raw error text
        errorMessage = errorText;
      }
      
      throw new Error(errorMessage);
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

  /**
   * Make a public GET request
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET'
    });
  }

  /**
   * Make a public POST request
   */
  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a public PUT request
   */
  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a public DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE'
    });
  }

  /**
   * Make a public PATCH request
   */
  async patch<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }
}


