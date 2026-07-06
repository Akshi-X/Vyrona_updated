import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import TrackCanisterModal from '../../components/TrackCanisterModal';
import HamburgerButton from '../../components/HamburgerButton';

export default function IVFTrackShipmentSearchPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const isOnboarding = location.pathname.startsWith("/onboarding");
    const [canisterError, setCanisterError] = useState<string | undefined>(undefined);

    return (
        <div className="flex-1 min-h-screen flex items-center justify-center relative">
            <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: 'url(/ivf_pattern.png)', backgroundSize: '20%', backgroundRepeat: 'repeat', opacity: 0.6 }} />
            <div className="fixed top-3 left-4 z-30 md:hidden">
                <HamburgerButton />
            </div>
            <div className="relative z-10 w-full max-w-[560px]">
                <TrackCanisterModal
                    inlineMode={true}
                    isOpen={true}
                    onClose={() => {
                        setCanisterError(undefined);
                        navigate(isOnboarding ? "/onboarding/dashboard" : "/dashboard");
                    }}
                    error={canisterError}
                    onTrack={(canisterId) => {
                        setCanisterError(undefined);
                        const prefix = isOnboarding ? "/onboarding" : "";
                        navigate(`${prefix}/ivf-track-shipment/${encodeURIComponent(canisterId)}`);
                    }}
                />
            </div>
        </div>
    );
}
