import React, { useState, useEffect, useRef } from 'react';
import Modal from '../Modal';
import ContainerQualityTrackingIcon from '../../assets/DashBoardIcons/DarkContainerQualityTracking.svg';

interface TrackCanisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrack?: (canisterId: string) => void;
  error?: string;
  title?: string;
  icon?: string;
}

const TrackCanisterModal: React.FC<TrackCanisterModalProps> = ({
  isOpen,
  onClose,
  onTrack,
  error,
  title = "Track Container Quality",
  icon = ContainerQualityTrackingIcon,
}) => {
  const [canisterId, setCanisterId] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setCanisterId('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canisterId.trim()) return;
    onTrack?.(canisterId.trim());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description="Please enter the canister ID"
      icon={
        <img
          src={icon}
          alt="Track Canister"
          className="w-6 h-6 mt-5"
        />
      }
      containerClassName="w-[40%]"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <input
            ref={inputRef}
            type="text"
            value={canisterId}
            onChange={(e) => setCanisterId(e.target.value)}
            placeholder="e.g., 1"
            className="w-full px-4 py-3 rounded-md border border-[#650458] outline-none focus:ring-2 focus:ring-[#bd56af] focus:border-[#bd56af]"
          />
          {error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-md bg-[#650458] text-white hover:opacity-95 disabled:opacity-50"
            disabled={!canisterId.trim()}
          >
            Track
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TrackCanisterModal;
