import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { userService } from '../../services/userService';
import IncubatorQualityTrackingIcon from '../../assets/DashBoardIcons/IncubatorQualityTracking.svg';

interface IncubatorCardItem {
  id: string;
  tankId?: number;
  label: string;
  branchName: string;
  status?: string;
}

export default function IncubatorTrackingDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [userInitials, setUserInitials] = useState<string>('U');
  const [incubators, setIncubators] = useState<IncubatorCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        setUserInitials(`${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U');
      } catch {
        // ignore
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const fetchIncubators = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Mock incubator data
        const mockIncubators: IncubatorCardItem[] = [
          {
            id: "T40",
            tankId: 40,
            label: "T40",
            branchName: "Egmore",
            status: "Active"
          },
          {
            id: "T10",
            tankId: 10,
            label: "T10",
            branchName: "Tambaram",
            status: "Active"
          },
          {
            id: "T20",
            tankId: 20,
            label: "T20",
            branchName: "Tambaram",
            status: "Active"
          },
          {
            id: "T30",
            tankId: 30,
            label: "T30",
            branchName: "Tambaram",
            status: "Active"
          },
          {
            id: "T50",
            tankId: 50,
            label: "T50",
            branchName: "Tambaram",
            status: "Active"
          }
        ];
        
        setIncubators(mockIncubators);
      } catch (err: any) {
        setError(err?.message || 'Failed to load incubators');
        setIncubators([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchIncubators();
  }, []);

  return (
    <div className="bg-[#FDFAFF] flex w-full h-full">
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-[63px]">
        <header className="fixed top-0 left-60 right-0 h-[63px] bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-6 z-40">
          <div />
          <div
            className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
            onClick={() => navigate('/user-profile')}
            title="Go to User Profile"
          >
            <span className="text-white text-xs font-semibold">{userInitials}</span>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-y-auto min-h-0">
          <div className="flex items-center gap-1 text-sm mb-6">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-gray-500 text-[12px] hover:text-gray-700 transition-colors"
            >
              Dashboard
            </button>
            <span className="text-gray-500">/</span>
            <span className="text-black font-semibold">Incubators</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-6">Incubators</h1>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#9c3aa6] border-t-transparent" />
            </div>
          )}
          {error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-6">
              {error}
            </div>
          )}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {incubators.map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => navigate(`/incubator-tracking/${encodeURIComponent(inc.id)}`)}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-[#9c3aa6]/30 transition-all duration-200 overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:ring-offset-2"
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-[#FDFAFF] to-[#f3e8f7] flex items-center justify-center p-4">
                    <img
                      src={IncubatorQualityTrackingIcon}
                      alt=""
                      className="w-16 h-16 opacity-80"
                    />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-gray-900 mt-1">{inc.label}</p>
                    <p className="text-sm text-gray-600">{inc.branchName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && !error && incubators.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
              No incubators found. Data will appear when available.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
