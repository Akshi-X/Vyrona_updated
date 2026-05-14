import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { DatabaseTable } from '../../components/DatabaseTable';
import Header from '../../components/Header';
import { useEffect, useState } from 'react';
import { userService } from '../../services/userService';

export default function Database() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [userInitials, setUserInitials] = useState<string>('');

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
        setUserInitials(initials);
      } catch {
        setUserInitials('U');
      }
    };
    if (isAuthenticated) {
      fetchUserProfile();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the database.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface flex w-full" style={{ height: '100vh' }}>
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          title=""
          showBackButton={false}
          className=""
          rightContent={(
            <div 
              className="w-[30px] h-[30px] bg-primary-muted rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
              onClick={() => navigate('/user-profile')}
              title="Go to User Profile"
            >
              <span className="text-white text-xs font-semibold">{userInitials}</span>
            </div>
          )}
        />

        {/* Database Content */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0" style={{ paddingTop: 'calc(63px + 1rem)' }}>
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-black text-2xl">
              Patient Records
            </h1>
            {/* TODO: Add total patients and add patient button */}
            {/* <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Total Patients: <span className="font-semibold text-primary">{patientData.patients.length}</span>
              </div>
              <button className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#5a0f66] transition-colors">
                Add Patient
              </button>
            </div> */}
          </div>

          {/* Database Table */}
          <div className="flex-1">
            <DatabaseTable pharmaId="1" />
          </div>
        </div>
      </main>
    </div>
  );
}
