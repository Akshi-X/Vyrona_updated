import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { DatabaseTable } from '../../components/DatabaseTable';
import PageLayout from '../../components/PageLayout';
import { useEffect, useState } from 'react';
import { userService } from '../../services/userService';
import DatabaseIcon from '../../assets/DashBoardIcons/DatabaseDark.svg';

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

  const avatarButton = (
    <div
      className="w-[30px] h-[30px] bg-primary-muted rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
      onClick={() => navigate('/user-profile')}
      title="Go to User Profile"
    >
      <span className="text-white text-xs font-semibold">{userInitials}</span>
    </div>
  );

  return (
    <PageLayout
      title="Database"
      icon={DatabaseIcon}
      description="Browse and manage your patient and canister database."
      actions={avatarButton}
    >
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
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
    </PageLayout>
  );
}
