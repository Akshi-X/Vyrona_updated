import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authUtils } from '../utils/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | undefined;
  login: (token: string) => void;
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

  useEffect(() => {
    // Check for existing token on mount
    const existingToken = authUtils.getToken();
    if (existingToken) {
      setToken(existingToken);
      setIsAuthenticated(true);
    }
  }, []);

  const login = (newToken: string) => {
    authUtils.setToken(newToken);
    setToken(newToken);
    setIsAuthenticated(true);
  };

  const logout = () => {
    authUtils.removeToken();
    setToken(undefined);
    setIsAuthenticated(false);
  };

  const value: AuthContextType = {
    isAuthenticated,
    token,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
