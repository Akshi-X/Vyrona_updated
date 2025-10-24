import React from 'react';
import Modal from '../Modal';

interface StakeholderChat {
  id: string;
  sender: string;
  patientId: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

interface StakeholderChatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chats: StakeholderChat[];
}

const StakeholderChatsModal: React.FC<StakeholderChatsModalProps> = ({
  isOpen,
  onClose,
  chats
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stakeholder Chats"
      description="Communicate with stakeholders and track conversations"
      icon={
        <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      }
    >
      {/* Chats List */}
      <div className="space-y-4">
        {chats.map((chat) => (
          <div 
            key={chat.id} 
            className="p-4 rounded-lg border bg-purple-50 border-purple-200"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold bg-purple-600">
                  {chat.sender.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-purple-900">
                    {chat.sender}
                  </h4>
                  <p className="text-xs text-gray-500">{chat.patientId}</p>
                </div>
              </div>
              <span className="text-xs text-purple-600">
                {chat.timestamp}
              </span>
            </div>
            <p className="text-sm text-purple-800">
              {chat.message}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default StakeholderChatsModal;
