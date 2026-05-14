import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TrackCanisterModal from '../../components/TrackCanisterModal';
import HamburgerButton from '../../components/HamburgerButton';

export default function IVFTrackShipmentSearchPage() {
    const navigate = useNavigate();
    const [canisterError, setCanisterError] = useState<string | undefined>(undefined);

    return (
        <div className="flex-1 min-h-screen flex items-center justify-center">
            <div className="fixed top-3 left-4 z-30 md:hidden">
                <HamburgerButton />
            </div>
            <TrackCanisterModal
                inlineMode={true}
                isOpen={true}
                onClose={() => {
                    setCanisterError(undefined);
                    navigate("/dashboard");
                }}
                error={canisterError}
                onTrack={(canisterId) => {
                    setCanisterError(undefined);
                    navigate(`/ivf-track-shipment/${encodeURIComponent(canisterId)}`);
                }}
            />
        </div>
    );
}
