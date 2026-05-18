import React, { useEffect, useRef, useState } from 'react';
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

type MoveType = 'embryoTransfer' | 'transit';

const MoveContainerModal: React.FC<MoveContainerModalProps> = ({
  isOpen,
  onClose,
  onMoveToIncubator,
  onMoveToTransit,
}) => {
  const [moveType, setMoveType] = useState<MoveType>('embryoTransfer');
  const [isMoveTypeDropdownOpen, setIsMoveTypeDropdownOpen] = useState(false);
  const moveTypeDropdownRef = useRef<HTMLDivElement>(null);
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingEmbryoTransfer, setLoadingEmbryoTransfer] = useState(false);

  // Close dropdown on outside click (same behavior/style pattern as Signup page dropdowns)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moveTypeDropdownRef.current && !moveTypeDropdownRef.current.contains(event.target as Node)) {
        setIsMoveTypeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Clear error when modal opens
  useEffect(() => {
    if (isOpen) {
      // Default selection: if incubator action exists, start there; otherwise fall back to transit.
      if (onMoveToIncubator) {
        setMoveType('embryoTransfer');
      } else if (onMoveToTransit) {
        setMoveType('transit');
      }
      setIsMoveTypeDropdownOpen(false);
      setError(null);
      setLoading(false);
      setLoadingEmbryoTransfer(false);
      setFromLocation('');
      setToLocation('');
      setDeviceId('');
    }
  }, [isOpen, onMoveToIncubator, onMoveToTransit]);

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

  const canSubmitTransit = Boolean(fromLocation.trim() && toLocation.trim());
  const isSubmitting = loading || loadingEmbryoTransfer;
  const moveTypeOptions: Array<{ value: MoveType; label: string; disabled: boolean }> = [
    { value: 'embryoTransfer', label: 'Move to Embryo Transfer', disabled: !onMoveToIncubator },
    { value: 'transit', label: 'Move to Transit', disabled: !onMoveToTransit },
  ];

  const moveTypeLabel = moveTypeOptions.find((x) => x.value === moveType)?.label ?? '';

  const applyMoveType = (next: MoveType) => {
    setMoveType(next);
    setIsMoveTypeDropdownOpen(false);
    setError(null);
    setFromLocation('');
    setToLocation('');
    setDeviceId('');
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

        <div className="w-full space-y-3 pb-2">
          {/* Move type dropdown */}
          <div className="relative w-full" ref={moveTypeDropdownRef}>
            <label className="block text-[14px] text-black font-medium mb-2">Move Type:</label>

            <div
              role="button"
              tabIndex={0}
              aria-haspopup="listbox"
              aria-expanded={isMoveTypeDropdownOpen}
              onClick={() => setIsMoveTypeDropdownOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsMoveTypeDropdownOpen((v) => !v);
                }
                if (e.key === 'Escape') {
                  setIsMoveTypeDropdownOpen(false);
                }
              }}
              className={`peer w-full border rounded-[10px] px-3 py-2 pr-10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${error ? "border-red-500" : "border-gray-300"} text-black`}
            >
              <div className="flex justify-between items-center">
                <span>{moveTypeLabel}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${isMoveTypeDropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {isMoveTypeDropdownOpen && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-[10px] shadow-lg">
                {moveTypeOptions.map((opt) => {
                  const selected = moveType === opt.value;
                  const disabled = opt.disabled;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={selected}
                      className={`px-3 py-2 transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${
                        disabled
                          ? "text-gray-400 cursor-not-allowed"
                          : "cursor-pointer hover:bg-[#8b2a96] hover:text-white"
                      } ${selected ? "bg-[#8b2a96] text-white" : ""}`}
                      onClick={() => {
                        if (disabled) return;
                        applyMoveType(opt.value);
                      }}
                    >
                      {opt.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transit description fields (only for transit) */}
          {moveType === 'transit' && (
            <div className="flex items-center gap-2 justify-center pt-2">
              <label className="text-[14px] text-black font-medium whitespace-nowrap">
                Description: From
              </label>
              <input
                type="text"
                value={fromLocation}
                onChange={(e) => {
                  setFromLocation(e.target.value);
                  setError(null);
                }}
                className="w-[140px] px-3 py-2 border-b-2 border-gray-300 focus:border-[#6B1176] focus:outline-none text-sm bg-transparent"
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
                className="w-[140px] px-3 py-2 border-b-2 border-gray-300 focus:border-[#6B1176] focus:outline-none text-sm bg-transparent"
                placeholder="To location"
              />
              <span className="text-[14px] text-black font-medium ml-2 whitespace-nowrap">Device Id:</span>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  setError(null);
                }}
                className="w-[120px] px-3 py-2 border-b-2 border-gray-300 focus:border-[#6B1176] focus:outline-none text-sm bg-transparent"
                placeholder="device ID"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="w-full px-3 py-2 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Single action button */}
        <button
          onClick={() => {
            if (moveType === 'embryoTransfer') {
              void handleMoveToEmbryoTransfer();
              return;
            }
            void handleMoveToTransit();
          }}
          disabled={
            isSubmitting ||
            (moveType === 'embryoTransfer' && !onMoveToIncubator) ||
            (moveType === 'transit' && (!onMoveToTransit || !canSubmitTransit))
          }
          className="w-full mt-2 px-4 py-3 rounded-md bg-gradient-to-r from-[#9C3AA6] to-[#6B1176] text-white hover:opacity-95 transition-opacity font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {(moveType === 'embryoTransfer' ? loadingEmbryoTransfer : loading) ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Moving...</span>
            </>
          ) : moveType === 'embryoTransfer' ? (
            'Move to Embryo Transfer'
          ) : (
            'Move to Transit'
          )}
        </button>
      </div>
    </Modal>
  );
};

export default MoveContainerModal;
