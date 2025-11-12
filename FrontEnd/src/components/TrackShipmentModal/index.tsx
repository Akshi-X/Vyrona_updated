import React, { useState, useEffect, useRef } from 'react';
import Modal from '../Modal';
import TrackingShipmentIcon from '../../assets/DashBoardIcons/Tracking_Shipment.svg';

interface TrackShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrack?: (patientId: string) => void;
  error?: string;
}

const TrackShipmentModal: React.FC<TrackShipmentModalProps> = ({
  isOpen,
  onClose,
  onTrack,
  error,
}) => {
  const [patientId, setPatientId] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setPatientId('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim()) return;
    onTrack?.(patientId.trim());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Track shipment"
      description="Please enter the patient ID"
      icon={
        <img
          src={TrackingShipmentIcon}
          alt="Track Shipment"
          className="w-6 h-6"
        />
      }
      containerClassName="w-[40%]"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <input
            ref={inputRef}
            type="text"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="e.g., ZQ812457"
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
            disabled={!patientId.trim()}
          >
            Track
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TrackShipmentModal;


