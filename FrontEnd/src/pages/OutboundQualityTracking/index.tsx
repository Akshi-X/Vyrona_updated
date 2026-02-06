import { useParams, useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import IVFQualityTrackingChart from '../IVFTrackShipment/sections/IVFQualityTrackingChart';
import { IVFQualityParametersTable } from '../IVFTrackShipment/sections/IVFQualityParametersTable';
import IVFTrackAndTraceMap from '../IVFTrackShipment/sections/IVFTrackAndTraceMap';
import { userService, type UserProfileDto } from '../../services/userService';

export default function OutboundQualityTrackingPage() {
    const { canisterId } = useParams<{ canisterId: string }>();
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [userInitials, setUserInitials] = useState<string>('U');
    const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);

    React.useEffect(() => {
        const fetchCurrentUser = async () => {
            try {
                const profile = await userService.getProfile();
                setCurrentUser(profile);
                const first = profile.first_name?.trim?.() || '';
                const last = profile.last_name?.trim?.() || '';
                const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
                setUserInitials(initials);
            } catch {
                // Error handled silently
            }
        };
        fetchCurrentUser();
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
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1 text-sm">
                        <button
                            type="button"
                            onClick={() => navigate('/dashboard')}
                            className="text-gray-500 text-[12px] mt-[2.5px] hover:text-gray-700 transition-colors"
                        >
                            Dashboard
                        </button>
                        <span className="text-gray-500">/</span>
                        <span className="text-black font-semibold">Outbound Quality Tracking</span>
                        {canisterId && (
                            <>
                                <span className="text-black font-semibold">-</span>
                                <span className="text-black font-semibold">Container ID: {canisterId}</span>
                            </>
                        )}
                    </div>

                    {/* Track and Trace Map */}
                    <div>
                        <IVFTrackAndTraceMap canisterNumber={canisterId} />
                    </div>

                    {/* Quality Parameter Table and Quality Tracking Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Quality Parameter Table */}
                        <div>
                            <IVFQualityParametersTable canisterNumber={canisterId} />
                        </div>

                        {/* Quality Tracking Chart */}
                        <div>
                            <IVFQualityTrackingChart canisterNumber={canisterId} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

