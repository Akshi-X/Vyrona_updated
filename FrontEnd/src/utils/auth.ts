import Cookies from 'js-cookie';

export const AUTH_TOKEN_KEY = 'auth_token';

export const authUtils = {
  // Save auth token to cookies with secure settings
  setToken: (token: string, rememberMe: boolean = false) => {
    // Set expiration based on remember me setting
    // If remember me is true: 9 hours, if false: 1 hour
    const expirationHours = rememberMe ? 9 : 1;
    // Calculate expiration date from now
    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + (expirationHours * 60 * 60 * 1000));
    
    Cookies.set(AUTH_TOKEN_KEY, token, {
      expires: expirationDate,
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
  },

  // Check if token is expired and clean up if necessary
  checkTokenExpiration: (): boolean => {
    const token = Cookies.get(AUTH_TOKEN_KEY);
    if (!token) {
      return false; // No token to check
    }
    
    // The js-cookie library automatically handles expiration
    // If the cookie is still present, it's not expired
    // If it's expired, js-cookie will return undefined
    return !!token;
  },

  // Force clear token (for logout)
  clearToken: (): void => {
    Cookies.remove(AUTH_TOKEN_KEY);
  }
};