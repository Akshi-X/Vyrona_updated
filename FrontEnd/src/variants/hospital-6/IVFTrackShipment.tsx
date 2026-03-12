/**
 * @variant IVFTrackShipmentHospital6
 * @hospital Yellow IVF (ID: 6)
 * @route /ivf-track-shipment, /ivf-track-shipment/:tankId
 * Custom IVF Track Shipment for Yellow IVF — same layout, pale yellow background.
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';

const IVFTrackShipmentHospital6: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { tankId } = useParams<{ tankId?: string }>();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="flex w-full h-[100vh] overflow-x-hidden bg-[#fefce8]"
      style={{ maxWidth: '100vw', touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
    >
      <Sidebar onLogout={handleLogout} />
      <main
        className="flex-1 flex flex-col overflow-x-hidden overflow-y-hidden ml-60 min-w-0"
        style={{
          maxWidth: 'calc(100vw - 15rem)',
          touchAction: 'pan-y',
          overscrollBehaviorX: 'none',
          height: '100vh',
        }}
      >
        <div
          className="flex-1 p-6 pt-10 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0"
          style={{
            touchAction: 'pan-y',
            overscrollBehaviorX: 'none',
            overscrollBehaviorY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <header className="mb-2">
            <h1 className="text-3xl font-bold text-gray-900">IVF Track Shipment</h1>
            <p className="text-gray-600 mt-1">
              Yellow IVF {tankId ? `— Tank / Canister: ${tankId}` : '— shipment tracking'}
            </p>
          </header>
          <div className="bg-white/80 rounded-lg shadow-md p-6">
            <p className="text-gray-600">
              IVF track shipment content for Hospital 6.
              {tankId && ` Viewing tank/canister: ${tankId}. `}
              Replace with your own tables and charts.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default IVFTrackShipmentHospital6;
