import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  restrictedRoles?: string[];
  restrictIVFAdmin?: boolean; // Redirect IVF Admin to approval screen on certain routes
  requireControlTower?: boolean; // If true, IVF User (H.User) is redirected to dashboard – no Control Tower access
}

export const RoleBasedRoute: React.FC<RoleBasedRouteProps> = ({ 
  children, 
  allowedRoles, 
  restrictedRoles,
  restrictIVFAdmin = false,
  requireControlTower = false
}) => {
  const { isAuthenticated, isLoading, userRole, onboardingCompleted } = useAuth();
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

  // Show loading spinner while checking authentication, department, or onboarding status.
  // Only wait for onboardingCompleted when authenticated — unauthenticated users redirect to login below.
  if (isLoading || isCheckingDepartment || (isAuthenticated && onboardingCompleted === undefined)) {
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

  // Redirect to onboarding if user hasn't completed it yet
  if (!onboardingCompleted) {
    return <Navigate to="/onboarding/dashboard" replace />;
  }

  // IVF Admin on restricted page → redirect to approval screen (pending list)
  const isIVFAdmin = userDepartment === 'IVF' && userRole?.toLowerCase() === 'admin';
  if (restrictIVFAdmin && isIVFAdmin) {
    return <Navigate to="/approval" replace />;
  }

  // Restricted role (e.g. mygrape_admin) → redirect to user profile
  if (restrictedRoles && userRole && restrictedRoles.includes(userRole)) {
    return <Navigate to="/user-profile" replace />;
  }

  // Control Tower: IVF User (H.User) has no access – redirect to dashboard
  if (requireControlTower && userDepartment === 'IVF' && userRole === 'User') {
    return <Navigate to="/dashboard" replace />;
  }

  // Role not in allowed roles → redirect to dashboard
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Render content if access is allowed
  return <>{children}</>;
};
