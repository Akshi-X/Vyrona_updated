import React from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  containerClassName?: string;
  headerAction?: React.ReactNode;
  scrollableContainerClassName?: string; // allows custom scrollbar styling
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  containerClassName,
  headerAction,
  scrollableContainerClassName: _scrollableContainerClassName
}) => {
  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/70 overflow-hidden h-full w-full z-[100]"
      onClick={onClose}
    >
      <div className="flex items-center justify-center min-h-screen p-4">
        <div 
          className={`relative mx-auto border ${containerClassName ?? 'w-4/5'} shadow-lg rounded-md bg-white max-h-[90vh] overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                {icon && (
                  <div className="w-8 h-8 flex items-center justify-center mr-3">
                    {icon}
                  </div>
                )}
                <div>
                  <h3 className="text-[16px] font-semibold text-black mt-5">{title}</h3>
                  <p className="text-[12px] text-[#969696]">{description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {headerAction}
                {/* Close Icon */}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
