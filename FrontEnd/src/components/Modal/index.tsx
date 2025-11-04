import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-transparent backdrop-blur-sm overflow-hidden h-full w-full z-50"
      onClick={onClose}
    >
      <div className="flex items-center justify-center min-h-screen p-4">
        <div 
          className="relative mx-auto border w-4/5 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg mr-3">
                  {icon}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-500">{description}</p>
                </div>
              </div>
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

            {/* Modal Content */}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
