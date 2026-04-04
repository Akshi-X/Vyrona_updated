import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TrackCanisterModal from '../../components/TrackCanisterModal';

export default function IVFTrackShipmentSearchPage() {
    const navigate = useNavigate();
    const [canisterError, setCanisterError] = useState<string | undefined>(undefined);

    return (
        <div className="flex-1 min-h-screen flex items-center justify-center">
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
