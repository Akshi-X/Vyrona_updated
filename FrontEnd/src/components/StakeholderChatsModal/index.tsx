import React from 'react';
import AlertCard from '../AlertCard';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';

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
  id?: string;
}

const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const avatarColors = [
  'bg-[#6b1176]',
  'bg-[#0f766e]',
  'bg-[#1d4ed8]',
  'bg-[#b45309]',
  'bg-[#be185d]',
  'bg-[#4f46e5]',
];

const getAvatarColor = (name: string): string => {
  const idx = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[idx];
};

const StakeholderChatsModal: React.FC<StakeholderChatsModalProps> = ({
  isOpen,
  onClose,
  chats,
  loading = false,
  id,
}) => {
  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      id={id}
      title="Stakeholder Chats"
      description="Communicate with stakeholders and track conversations"
      containerClassName="w-full max-w-[750px]"
      contentHeightClassName="md:h-[520px]"
      icon={
        <img src={StakeholderChatsIcon} alt="Stakeholder Chats" className="w-[24px] h-[24px]" />
      }
      loading={loading}
      loadingText="Loading chats..."
      emptyText="No chats found"
      dataLength={chats.length}
    >
      <div className="flex flex-col gap-2 p-4">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`rounded-xl border p-4 transition-colors ${
              !chat.isRead
                ? 'border-[#6b1176] bg-purple-50'
                : 'border-gray-200 bg-white hover:border-purple-200'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getAvatarColor(chat.sender)}`}>
                  {getInitials(chat.sender)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#333]">{chat.sender}</span>
                    {!chat.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#6b1176] shrink-0" title="Unread" />
                    )}
                  </div>
                  <span className="text-xs text-gray-500 font-mono">{chat.patientId}</span>
                </div>
              </div>
              <span className="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">
                {formatTimestamp(chat.timestamp)}
              </span>
            </div>

            {/* Message */}
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 pl-[42px]">
              {chat.message}
            </p>
          </div>
        ))}
      </div>
    </AlertCard>
  );
};

export default StakeholderChatsModal;
