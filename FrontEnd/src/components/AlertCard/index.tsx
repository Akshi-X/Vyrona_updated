import React from 'react';
import Modal from '../Modal';

interface AlertCardProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  dataLength?: number;
  containerClassName?: string;
  contentHeightClassName?: string; // allows per-modal height control
  headerAction?: React.ReactNode;
  disableInnerScroll?: boolean; // allows disabling inner scroll for specific modals
  thinScrollbar?: boolean; // allows thin scrollbar styling for specific modals
}

const AlertCard: React.FC<AlertCardProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  loading = false,
  loadingText = "Loading...",
  emptyText = "No data found",
  dataLength = 0,
  containerClassName,
  contentHeightClassName = 'h-[300px]',
  headerAction,
  disableInnerScroll = false,
  thinScrollbar = false
}) => {
  return (
    <>
      {thinScrollbar && (
        <style>{`
          .alert-card-thin-scrollbar {
            scrollbar-width: thin;
          }
          .alert-card-thin-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
        `}</style>
      )}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        description={description}
        icon={icon}
        containerClassName={containerClassName}
        headerAction={headerAction}
        scrollableContainerClassName={thinScrollbar ? 'alert-card-thin-scrollbar' : ''}
      >
      <div className="w-full">
        {loading ? (
          <div className={`flex items-center justify-center py-12 ${contentHeightClassName}`}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-3 text-gray-600">{loadingText}</span>
          </div>
        ) : dataLength === 0 ? (
          <div className={`text-center py-12 ${contentHeightClassName} flex flex-col items-center justify-center`}>
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg">{emptyText}</p>
          </div>
        ) : disableInnerScroll ? (
          <div className="w-full">
            <style>{`
              .alert-card-table thead {
                position: sticky;
                top: 0;
                z-index: 10;
                background-color: rgb(250 245 255);
              }
            `}</style>
            {children}
          </div>
        ) : (
          <div className={`w-full ${contentHeightClassName} overflow-x-auto overflow-y-auto relative ${thinScrollbar ? 'alert-card-thin-scrollbar' : ''}`}>
            {children}
          </div>
        )}
      </div>
    </Modal>
    </>
  );
};

export default AlertCard;
