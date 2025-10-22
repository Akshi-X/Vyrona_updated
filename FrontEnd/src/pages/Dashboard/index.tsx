import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';

export default function Dashboard() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the dashboard.</p>
      </div>
    );
  }

  const logoutButton = (
    <button
      onClick={logout}
      className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
    >
      Logout
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        title="Dashboard" 
        showBackButton={false}
        rightContent={logoutButton}
      />
      
      <div className="p-6 pt-20">
      <p className="text-gray-600 mb-4">Welcome to your dashboard!</p>
      <button
        onClick={() => navigate('/user-profile')}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Go to User Profile
      </button>
      <button
        onClick={() => navigate('/support')}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 ml-2"
      >
        Go to Support
      </button>
      </div>
    </div>
  );
}


