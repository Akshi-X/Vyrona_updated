import React from 'react';
import Modal from '../Modal';
import canisterMoveto from '../../assets/canistermoveto.svg';

interface MoveContainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMoveToIncubator?: () => void;
  onMoveToTransit?: () => void;
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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
          Confirm Container Transfer?
        </h3>

        {/* Description */}
        <p className="text-[14px] text-[#969696] text-center leading-relaxed pb-8">
          The container will be moved based on the appropriate next step.
        </p>

        {/* Action Buttons - Side by Side */}
        <div className="flex gap-3 w-full pt-2">
          <button
            onClick={() => {
              onMoveToIncubator?.();
              onClose();
            }}
            className="flex-1 px-4 py-2.5 rounded-md bg-gradient-to-r from-[#9C3AA6] to-[#6B1176] text-white hover:opacity-95 transition-opacity font-medium text-sm"
          >
            Embryo Transfer
          </button>
          <button
            onClick={() => {
              onMoveToTransit?.();
              onClose();
            }}
            className="flex-1 px-4 py-2.5 rounded-md bg-white text-[#6B1176] border border-[#FCDDFF] hover:bg-gray-50 transition-colors font-[500] text-sm"
          >
            Move to Transit
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MoveContainerModal;
