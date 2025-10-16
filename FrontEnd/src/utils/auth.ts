import Cookies from 'js-cookie';

export const AUTH_TOKEN_KEY = 'auth_token';

export const authUtils = {
  // Save auth token to cookies with secure settings
  setToken: (token: string) => {
    Cookies.set(AUTH_TOKEN_KEY, token, {
      expires: 1, // 1 day
      secure: true, // Only send over HTTPS
      sameSite: 'strict' // CSRF protection
    });
  },

  // Get auth token from cookies
  getToken: (): string | undefined => {
    return Cookies.get(AUTH_TOKEN_KEY);
  },

  // Remove auth token from cookies
  removeToken: () => {
    Cookies.remove(AUTH_TOKEN_KEY);
  },

  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    return !!Cookies.get(AUTH_TOKEN_KEY);
  },

  // Get authorization header for API requests
  getAuthHeader: (): { Authorization: string } | {} => {
    const token = Cookies.get(AUTH_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
};
