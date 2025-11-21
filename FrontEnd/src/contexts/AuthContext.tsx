import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authUtils } from '../utils/auth';
import { authService } from '../services/authService';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | undefined;
  isLoading: boolean;
  userRole?: string;
  isEmailNotificationsEnabled: boolean;
  setIsEmailNotificationsEnabled: (enabled: boolean) => void;
  login: (token: string, role?: string, rememberMe?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [userRole, setUserRole] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState<number | null>(null);
  const [isEmailNotificationsEnabled, setIsEmailNotificationsEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('email_notify_pref');
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  // Function to set session timeout
  const setSessionTimeoutHandler = (rememberMe: boolean = false) => {
    // Clear existing timeout
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
    }
    
    // Set new timeout based on remember me setting
    const timeoutDuration = rememberMe ? 9 * 60 * 60 * 1000 : 60 * 60 * 1000; // 9 hours or 1 hour in milliseconds
    const timeout = setTimeout(() => {
      logout();
    }, timeoutDuration);
    
    setSessionTimeout(timeout);
  };

  useEffect(() => {
    // Check for existing token on mount
    const existingToken = authUtils.getToken();
    const existingRole = localStorage.getItem('user_role');
    if (existingToken) {
      setToken(existingToken);
      setIsAuthenticated(true);
      if (existingRole) {
        setUserRole(existingRole);
      }
      // Set session timeout for existing session (assume non-remember me for security)
      setSessionTimeoutHandler(false);
    }
    setIsLoading(false);

    // Function to check and sync authentication state
    const checkAndSyncAuth = () => {
      const currentToken = authUtils.getToken();
      const currentRole = localStorage.getItem('user_role');
      
      if (currentToken) {
        // If we have a token, ensure we're authenticated
        setToken(currentToken);
        setIsAuthenticated(true);
        if (currentRole) {
          setUserRole(currentRole);
        }
      } else {
        // If we don't have a token, ensure we're not authenticated
        setToken(undefined);
        setIsAuthenticated(false);
        setUserRole(undefined);
      }
    };

    // Listen for storage changes (for user_role in localStorage)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role') {
        const newRole = e.newValue;
        if (newRole) {
          setUserRole(newRole);
        } else {
          setUserRole(undefined);
        }
      }
      // Check auth state when storage changes (cookies are shared, so check token)
      checkAndSyncAuth();
    };

    // Listen for window focus to check authentication state
    // This handles the case where user logs in on another tab
    const handleFocus = () => {
      checkAndSyncAuth();
    };

    // Listen for visibility changes (when tab becomes visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndSyncAuth();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Persist email notification preference
  useEffect(() => {
    try {
      localStorage.setItem('email_notify_pref', JSON.stringify(isEmailNotificationsEnabled));
    } catch {}
  }, [isEmailNotificationsEnabled]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
    };
  }, [sessionTimeout]);

  const login = (newToken: string, role?: string, rememberMe: boolean = false) => {
    authUtils.setToken(newToken, rememberMe);
    setToken(newToken);
    setIsAuthenticated(true);

    if (role) {
      setUserRole(role);
      localStorage.setItem('user_role', role);
    }

    // Set session timeout
    setSessionTimeoutHandler(rememberMe);
  };

  const logout = () => {
    // Clear session timeout
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
      setSessionTimeout(null);
    }
    
    authService.logout();
    setToken(undefined);
    setUserRole(undefined);
    setIsAuthenticated(false);
    localStorage.removeItem('user_role');
  };

  const value: AuthContextType = {
    isAuthenticated,
    token,
    isLoading,
    userRole,
    isEmailNotificationsEnabled,
    setIsEmailNotificationsEnabled,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};