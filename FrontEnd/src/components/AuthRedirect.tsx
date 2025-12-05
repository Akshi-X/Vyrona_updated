import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const AuthRedirect: React.FC = () => {
  const { isAuthenticated, isLoading, userRole } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6b1176]"></div>
      </div>
    );
  }

  // Helper function to check if user is an admin role
  const isAdminRole = (role?: string): boolean => {
    if (!role) return false;
    const roleLower = role.toLowerCase();
    return roleLower === 'admin' || roleLower === 'mygrape_admin' || roleLower === 'pharma_admin';
  };

  // Redirect based on authentication and role
  if (isAuthenticated) {
    // If user is an admin role, redirect to user-profile
    if (isAdminRole(userRole)) {
      return <Navigate to="/user-profile" replace />;
    }
    // For other roles, redirect to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  // Redirect to login if not authenticated
  return <Navigate to="/login" replace />;
};
