import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TrackCanisterModal from '../../components/TrackCanisterModal';
import TrackingPageShell from '../../components/TrackingPageShell';

export default function IVFTrackShipmentSearchPage() {
    const navigate = useNavigate();
    const [canisterError, setCanisterError] = useState<string | undefined>(undefined);

    return (
        <TrackingPageShell>
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
                    navigate(`/cryocan-tracking/${encodeURIComponent(canisterId)}`);
                }}
            />
        </TrackingPageShell>
    );
}
