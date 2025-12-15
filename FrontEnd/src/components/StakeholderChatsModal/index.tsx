import React from 'react';
import AlertCard from '../AlertCard';

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
  loading?: boolean;
}

// Utility function to format timestamp in UTC
const formatUTCTimestamp = (timestamp: string): string => {
  try {
    // Try to parse the timestamp string as a date
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return timestamp; // Return original string if invalid
    }
    
    // Format: YYYY-MM-DD HH:mm:ss UTC
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
  } catch {
    return timestamp; // Return original string on error
  }
};

const StakeholderChatsModal: React.FC<StakeholderChatsModalProps> = ({
  isOpen,
  onClose,
  chats,
  loading = false
}) => {
  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title="Stakeholder Chats"
      description="Communicate with stakeholders and track conversations"
      icon={
        <svg className="w-[18px] h-[18px] text-[#6b1176]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      }
      loading={loading}
      loadingText="Loading chats..."
      emptyText="No chats found"
      dataLength={chats.length}
    >
      <div className="space-y-3">
        <style>{`
          .chat-msg-2line {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            word-break: break-word;
          }
        `}</style>
        {chats.map((chat) => (
          <div 
            key={chat.id} 
            className="p-3 rounded-lg border bg-[#fdeeff] border-[#eeeeee] hover:bg-white/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-2 flex-shrink-0">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold bg-[#6b1176]">
                  {chat.sender.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[#333333]">
                    {chat.sender}
                  </h4>
                  <p className="text-xs text-[#333333] font-mono">{chat.patientId}</p>
                </div>
              </div>
              <p className="text-sm text-[#333333] flex-1 text-left chat-msg-2line ml-4" title={chat.message}>
                {chat.message}
              </p>
              <span className="text-xs text-[#333333] flex-shrink-0">
                {formatUTCTimestamp(chat.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </AlertCard>
  );
};

export default StakeholderChatsModal;
