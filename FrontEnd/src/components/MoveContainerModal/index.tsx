import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import canisterMoveto from '../../assets/canistermoveto.svg';

interface MoveContainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMoveToIncubator?: () => Promise<void>;
  onMoveToTransit?: (description: string) => Promise<void>;
  containerData?: {
    hisNumber?: string;
    cryolockNum?: string;
    canisterNum?: string | number;
    caneCode?: string;
  };
}

const MoveContainerModal: React.FC<MoveContainerModalProps> = ({
  isOpen,
  onClose,
  onMoveToIncubator,
  onMoveToTransit,
}) => {
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingEmbryoTransfer, setLoadingEmbryoTransfer] = useState(false);

  // Clear error when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false);
      setLoadingEmbryoTransfer(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setFromLocation('');
    setToLocation('');
    setDeviceId('');
    setError(null);
    setLoading(false);
    setLoadingEmbryoTransfer(false);
    onClose();
  };

  const handleMoveToEmbryoTransfer = async () => {
    if (!onMoveToIncubator) {
      return;
    }

    setError(null);
    setLoadingEmbryoTransfer(true);
    
    try {
      await onMoveToIncubator();
      handleClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to move container to embryo transfer');
    } finally {
      setLoadingEmbryoTransfer(false);
    }
  };

  const handleMoveToTransit = async () => {
    if (!fromLocation.trim() || !toLocation.trim()) {
      setError('Please fill in From and To locations');
      return;
    }
    
    if (!onMoveToTransit) {
      return;
    }

    setError(null);
    setLoading(true);
    
    try {
      const deviceIdPart = deviceId.trim() ? `, Device ID : ${deviceId.trim()}` : '';
      const description = `From ${fromLocation.trim()} to ${toLocation.trim()}${deviceIdPart}`;
      await onMoveToTransit(description);
      handleClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to move container to transit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      description=""
      containerClassName="w-[682px]"
    >
      <div className="flex flex-col items-center space-y-2 pb-2 -mt-8">
        {/* Centered Icon with circular purple background */}
        <div className="flex justify-center">
          <div className="w-[71px] h-[71px] rounded-full bg-[#FEF2FF] flex items-center justify-center">
            <img
              src={canisterMoveto}
              alt="Move Container"
              className="w-[41px] h-[41px]"
            />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-[18px] font-semibold text-black text-center leading-tight">
          Do you want to move this container ?
        </h3>

        {/* Description */}
        <p className="text-[14px] text-[#969696] text-center leading-relaxed pb-4">
          The Container will be move from Your end to other center
        </p>

        {/* Input Fields */}
        <div className="w-full space-y-3 pb-4">
          <div className="flex items-center gap-2 justify-center">
            <label className="text-[14px] text-black font-medium whitespace-nowrap">
              Discription: From
            </label>
            <input
              type="text"
              value={fromLocation}
              onChange={(e) => {
                setFromLocation(e.target.value);
                setError(null);
              }}
              className="w-[120px] px-3 py-2 border-b-2 border-gray-300 focus:border-[#6B1176] focus:outline-none text-sm"
              placeholder="From location"
            />
            <span className="text-[14px] text-black font-medium">to</span>
            <input
              type="text"
              value={toLocation}
              onChange={(e) => {
                setToLocation(e.target.value);
                setError(null);
              }}
              className="w-[120px] px-3 py-2 border-b-2 border-gray-300 focus:border-[#6B1176] focus:outline-none text-sm"
              placeholder="To location"
            />
            <span className="text-[14px] text-black font-medium ml-2">Device Id:</span>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                setError(null);
              }}
              className="w-[100px] px-3 py-2 border-b-2 border-gray-300 focus:border-[#6B1176] focus:outline-none text-sm"
              placeholder="device ID"
            />
          </div>
          {/* Error Message */}
          {error && (
            <div className="w-full px-3 py-2 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Action Buttons - Side by Side */}
        <div className="flex gap-3 w-full pt-2">
          <button
            onClick={handleMoveToEmbryoTransfer}
            disabled={loadingEmbryoTransfer || loading}
            className="flex-1 px-4 py-2.5 rounded-md bg-gradient-to-r from-[#9C3AA6] to-[#6B1176] text-white hover:opacity-95 transition-opacity font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loadingEmbryoTransfer ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Moving...</span>
              </>
            ) : (
              'Move to Embryo Transfer'
            )}
          </button>
          <button
            onClick={handleMoveToTransit}
            disabled={!fromLocation.trim() || !toLocation.trim() || loading || loadingEmbryoTransfer}
            className="flex-1 px-4 py-2.5 rounded-md bg-white text-[#6B1176] border border-[#FCDDFF] hover:bg-gray-50 transition-colors font-[500] text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-[#6B1176]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Moving...</span>
              </>
            ) : (
              'Move to Transit'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MoveContainerModal;
