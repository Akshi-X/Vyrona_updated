import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const AuthRedirect: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6b1176]"></div>
      </div>
    );
  }

  // Redirect to dashboard if authenticated, otherwise to login
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};
