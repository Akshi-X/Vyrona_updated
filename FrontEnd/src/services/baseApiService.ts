/**
 * Base API Service
 * Provides common functionality for all API services
 */

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
    this.baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';
    this.useMock = false; // Set to true for mock responses
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/) : null;
      if (match) token = decodeURIComponent(match[1]);
    } catch {}
    
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

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
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
      credentials: 'include',
      body: formData,
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
   * Set mock mode
   */
  setMockMode(useMock: boolean): void {
    this.useMock = useMock;
  }
}


