import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  restrictedRoles?: string[];
  restrictIVFAdmin?: boolean; // New prop to restrict IVF Admin users
}

export const RoleBasedRoute: React.FC<RoleBasedRouteProps> = ({ 
  children, 
  allowedRoles, 
  restrictedRoles,
  restrictIVFAdmin = false
}) => {
  const { isAuthenticated, isLoading, userRole } = useAuth();
  const [userDepartment, setUserDepartment] = useState<string | null>(null);
  const [isCheckingDepartment, setIsCheckingDepartment] = useState(true);

  // Fetch user department
  useEffect(() => {
    const fetchDepartment = async () => {
      if (!isAuthenticated) {
        setIsCheckingDepartment(false);
        return;
      }

      try {
        // Try to get department from localStorage first
        const storedDept = localStorage.getItem('department');
        if (storedDept) {
          setUserDepartment(storedDept.toUpperCase());
          setIsCheckingDepartment(false);
          return;
        }

        // Fall back to API if not in localStorage
        const profile = await userService.getProfile();
        const department = profile.department?.toUpperCase() || null;
        setUserDepartment(department);
        
        // Store in localStorage for future use
        if (department) {
          localStorage.setItem('department', department);
        }
      } catch {
        // Try to get from localStorage even if API fails
        const storedDept = localStorage.getItem('department');
        if (storedDept) {
          setUserDepartment(storedDept.toUpperCase());
        }
      } finally {
        setIsCheckingDepartment(false);
      }
    };

    fetchDepartment();
  }, [isAuthenticated]);

  // Show loading spinner while checking authentication or department
  if (isLoading || isCheckingDepartment) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6b1176]"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is IVF Admin (IVF department + Admin role) and access should be restricted
  const isIVFAdmin = userDepartment === 'IVF' && userRole?.toLowerCase() === 'admin';
  if (restrictIVFAdmin && isIVFAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  // Check if user role is in restricted roles
  if (restrictedRoles && userRole && restrictedRoles.includes(userRole)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">
            You don't have permission to access this page.
          </p>
          <button 
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-[#6b1176] text-white rounded-md hover:bg-[#8b2a96] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Check if user role is in allowed roles (if specified)
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">
            You don't have permission to access this page.
          </p>
          <button 
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-[#6b1176] text-white rounded-md hover:bg-[#8b2a96] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Render content if access is allowed
  return <>{children}</>;
};
