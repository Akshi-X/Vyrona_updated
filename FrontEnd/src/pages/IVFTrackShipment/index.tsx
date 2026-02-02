import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import ContainerDataTable from './sections/ContainerDataTable';
import RefillLogTable from './sections/RefillLogTable';
import IVFQualityTrackingChart from './sections/IVFQualityTrackingChart';
import { IVFQualityParametersTable } from './sections/IVFQualityParametersTable';
import backButton from '../../assets/backButton.svg';
import { userService } from '../../services/userService';

export default function IVFTrackShipmentPage() {
    const { canisterId } = useParams<{ canisterId: string }>();
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [userInitials, setUserInitials] = useState<string>('U');

    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                const profile = await userService.getProfile();
                const first = profile.first_name?.trim?.() || '';
                const last = profile.last_name?.trim?.() || '';
                const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
                if (isMounted) setUserInitials(initials);
            } catch {
                if (isMounted) setUserInitials('U');
            }
        })();
        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div className="bg-[#FDFAFF] flex w-full h-full">
            <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
            <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-[63px]">
                {/* Top Nav Bar (fixed) */}
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

                {/* Main Content */}
                <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
                    <div className="flex items-center gap-3 text-black text-sm font-semibold">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="inline-flex items-center justify-center w-[16px] h-[14px] rounded-md hover:bg-black/5 active:bg-black/10 transition-colors"
                            aria-label="Back"
                        >
                            <img src={backButton} alt="" className="w-4 h-4" />
                        </button>
                        <span>Container ID: {canisterId || 'Canister 1'}</span>
                    </div>
                    {/* <ContainerProcessFlow /> */}
                    {/* Row 1: Quality Tracking + Quality Parameter (left) | Container Data (right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Stacked Quality Tracking and Quality Parameter */}
                        <div className="flex flex-col gap-6">
                            <IVFQualityTrackingChart />
                            <ContainerDataTable canisterNumber={canisterId} />
                        </div>
                        {/* Right Column: Container Data */}
                        <div>
                            <IVFQualityParametersTable />
                        </div>
                    </div>

                    {/* Row 3: Refill Log (full width) */}
                    <div>
                        <RefillLogTable canisterNumber={canisterId} />
                    </div>

                </div>
            </main>
        </div>
    );
}
