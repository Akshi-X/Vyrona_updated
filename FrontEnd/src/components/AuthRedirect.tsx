import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';

export const AuthRedirect: React.FC = () => {
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

  // Redirect based on authentication and role
  if (isAuthenticated) {
    // Check if user is IVF Admin (IVF department + Admin role)
    const isIVFAdmin = userDepartment === 'IVF' && userRole?.toLowerCase() === 'admin';
    
    // If user is IVF Admin, redirect to approval
    if (isIVFAdmin) {
      return <Navigate to="/approval" replace />;
    }
    
    // If user is Mygrape_admin, redirect to user-profile
    if (userRole?.toLowerCase() === 'mygrape_admin') {
      return <Navigate to="/user-profile" replace />;
    }
    
    // For other roles, redirect to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  // Redirect to login if not authenticated
  return <Navigate to="/login" replace />;
};
