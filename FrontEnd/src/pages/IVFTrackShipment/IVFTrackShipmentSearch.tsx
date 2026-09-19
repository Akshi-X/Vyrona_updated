import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import TrackCanisterModal from '../../components/TrackCanisterModal';
import TrackingPageShell from '../../components/TrackingPageShell';

export default function IVFTrackShipmentSearchPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const isOnboarding = location.pathname.startsWith("/onboarding");
    const [canisterError, setCanisterError] = useState<string | undefined>(undefined);

    return (
        <TrackingPageShell>
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
                    navigate(`${prefix}/cryocan-tracking/${encodeURIComponent(canisterId)}`);
                }}
            />
        </TrackingPageShell>
    );
}
