import React, { useState, useEffect, useRef } from 'react';
import { chatService } from '../../services/chatService';
import { userService, type UserListItem, type UserProfileDto } from '../../services/userService';
import renderMessageWithMentions from './utils/renderMessageWithMentions';

type ChatMessage = { 
  id: string; 
  chatId: string; 
  sender: 'me' | 'them'; 
  text: string; 
  at: string; 
  senderName?: string; 
  senderId?: string; 
  isRead?: boolean; 
  readAt?: string; 
  wasUnread?: boolean 
};

interface StakeholderChatBoxProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string | undefined;
  onMessagesUpdated?: () => void; // Callback to refresh unread messages in parent
}

const StakeholderChatBox: React.FC<StakeholderChatBoxProps> = ({
  isOpen,
  onClose,
  patientId,
  onMessagesUpdated
}) => {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const unreadSeparatorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mentionMapRef = useRef<Map<string, string>>(new Map());
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserListItem[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [isUserTyping, setIsUserTyping] = useState(false);

  // Polling interval in milliseconds (5 seconds)
  const POLLING_INTERVAL_MS = 5000;
  // Typing timeout - resume polling after user stops typing for this duration (2 seconds)
  const TYPING_TIMEOUT_MS = 2000;

  // Fetch current user
  const fetchCurrentUser = async (): Promise<UserProfileDto | null> => {
    try {
      const profile = await userService.getProfile();
      setCurrentUser(profile);
      setCurrentUserId(profile.user_id);
      return profile;
    } catch (error) {
      return null;
    }
  };

  // Fetch users for mention functionality
  const fetchUsers = async () => {
    try {
      const response = await userService.getAllUsersInCompany();
      setUsers(response.users || []);
    } catch (error) {
      setUsers([]);
    }
  };

  // Load messages for selected patient
  const loadPatientMessages = async (patientId: string, userId?: string, showLoader: boolean = true) => {
    if (!patientId) return;
    if (showLoader) {
      setLoadingMessages(true);
    }
    try {
      // Use provided userId or currentUserId from state
      const userIdToCompare = userId || currentUserId;
      
      // First, get unread messages to track which ones were unread before opening
      const unreadResponse = await chatService.getUnreadMessages();
      const unreadIds = new Set(
        unreadResponse.unread_messages
          .filter(msg => msg.patient_id === patientId)
          .map(msg => msg.message_id.toString())
      );
      
      // Get patient messages - this endpoint automatically marks messages as read for current user
      const response = await chatService.getPatientMessages(patientId);
      const transformedMessages: ChatMessage[] = response.messages.map((msg) => {
        const isFromMe = userIdToCompare && msg.sender_id === userIdToCompare;
        const wasUnread = unreadIds.has(msg.id.toString());
        
        return {
          id: msg.id.toString(),
          chatId: patientId,
          sender: isFromMe ? 'me' : 'them',
          text: msg.message_content,
          at: new Date(msg.created_at).toLocaleString(),
          senderName: msg.sender_name,
          senderId: msg.sender_id,
          isRead: msg.is_read,
          readAt: msg.read_at,
          wasUnread: wasUnread && !isFromMe,
        };
      });
      setMessages(transformedMessages);
      
      // Notify parent to refresh unread messages
      if (onMessagesUpdated) {
        onMessagesUpdated();
      }
    } catch (error) {
      // Only clear messages if this was an initial load, not a polling update
      if (showLoader) {
        setMessages([]);
      }
    } finally {
      if (showLoader) {
        setLoadingMessages(false);
      }
    }
  };

  // When opening chat screen, load messages
  useEffect(() => {
    if (isOpen && patientId) {
      const initializeChat = async () => {
        const userProfile = await fetchCurrentUser();
        await fetchUsers();
        // Load messages after fetching user, passing the user ID directly
        if (userProfile) {
          await loadPatientMessages(patientId, userProfile.user_id);
        } else {
          await loadPatientMessages(patientId);
        }
      };
      initializeChat();
    } else {
      // Clear messages when chat is closed
      setMessages([]);
    }
  }, [isOpen, patientId]);

  // Polling effect - fetch new messages periodically when chat is open
  useEffect(() => {
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Start polling only if chat is open, patientId exists, user is not typing, and we have currentUserId
    if (isOpen && patientId && !isUserTyping && currentUserId) {
      // Set up polling interval
      // The effect will automatically recreate the interval when dependencies change
      pollingIntervalRef.current = setInterval(async () => {
        try {
          // Poll without showing loader to avoid UI flicker
          await loadPatientMessages(patientId, currentUserId, false);
        } catch (error) {
          // Silently handle polling errors to avoid console spam
        }
      }, POLLING_INTERVAL_MS);
    }

    // Cleanup function - clears interval when dependencies change or component unmounts
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isOpen, patientId, currentUserId, isUserTyping]);

  // Auto scroll to first unread message
  useEffect(() => {
    const el = chatScrollRef.current;
    const separatorEl = unreadSeparatorRef.current;
    
    if (el && messages.length > 0) {
      const firstUnreadIndex = messages.findIndex(m => m.wasUnread === true);
      const hasUnreadMessages = firstUnreadIndex !== -1;
      
      if (hasUnreadMessages && separatorEl) {
        setTimeout(() => {
          if (el && separatorEl) {
            const separatorTop = separatorEl.offsetTop;
            const containerTop = el.offsetTop;
            el.scrollTop = separatorTop - containerTop - 20;
          }
        }, 150);
      } else {
        setTimeout(() => {
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        }, 100);
      }
    }
  }, [messages, isOpen]);

  // Extract mentions from message text
  const extractMentions = (messageText: string): string[] => {
    if (!messageText || typeof messageText !== 'string') {
      return [];
    }
    
    if (!users || users.length === 0) {
      return [];
    }
    
    const mentionedUserIds: string[] = [];
    const mentionPatterns = [
      /@([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)+)/g,
      /@([a-zA-Z0-9_-]+)/g
    ];
    
    const allMatches: Array<{text: string, index: number}> = [];
    
    mentionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(messageText)) !== null) {
        const fullMatch = match[0].trim();
        allMatches.push({
          text: fullMatch,
          index: match.index
        });
      }
    });
    
    const uniqueMatches = Array.from(
      new Map(allMatches.map(m => [m.text.toLowerCase(), m])).values()
    ).sort((a, b) => a.index - b.index);
    
    for (const match of uniqueMatches) {
      const mentionText = match.text;
      const fullName = mentionText.substring(1).trim();
      const mentionKey = mentionText.toLowerCase().trim();
      
      if (mentionMapRef.current.has(mentionKey)) {
        const userId = mentionMapRef.current.get(mentionKey)!;
        if (userId && typeof userId === 'string' && userId.trim().length > 0) {
          mentionedUserIds.push(userId.trim());
          continue;
        }
      }
      
      const nameParts = fullName.split(/\s+/).filter(part => part.length > 0);
      
      if (nameParts.length >= 2) {
        const firstName = nameParts[0].trim();
        const lastName = nameParts[nameParts.length - 1].trim();
        
        const user = users.find(u => {
          if (!u.user_id || !u.first_name || !u.last_name) return false;
          const uFirst = u.first_name.toLowerCase().trim();
          const uLast = u.last_name.toLowerCase().trim();
          return uFirst === firstName.toLowerCase().trim() && uLast === lastName.toLowerCase().trim();
        });
        
        if (user && user.user_id) {
          mentionedUserIds.push(user.user_id.trim());
        } else {
          const fullNameLower = fullName.toLowerCase().trim();
          const userByFullName = users.find(u => {
            if (!u.user_id || !u.first_name || !u.last_name) return false;
            const userFullName = `${u.first_name} ${u.last_name}`.toLowerCase().trim();
            return userFullName === fullNameLower || userFullName.startsWith(fullNameLower);
          });
          
          if (userByFullName && userByFullName.user_id) {
            mentionedUserIds.push(userByFullName.user_id.trim());
          }
        }
      } else if (nameParts.length === 1) {
        const firstName = nameParts[0].trim();
        const user = users.find(u => {
          if (!u.user_id || !u.first_name) return false;
          return u.first_name.toLowerCase().trim() === firstName.toLowerCase().trim();
        });
        
        if (user && user.user_id) {
          mentionedUserIds.push(user.user_id.trim());
        }
      }
    }
    
    const uniqueIds = Array.from(new Set(mentionedUserIds))
      .filter(id => id && typeof id === 'string' && id.trim().length > 0);
    
    return uniqueIds;
  };

  const handleSendDraft = async () => {
    const text = draftMessage.trim();
    if (!patientId || !text) return;
    
    try {
      if (users.length === 0) {
        await fetchUsers();
      }
      
      let taggedUserIds = extractMentions(text);
      taggedUserIds = taggedUserIds.filter(id => id && typeof id === 'string' && id.trim().length > 0);
      
      if (!Array.isArray(taggedUserIds)) {
        taggedUserIds = [];
      }
      
      const requestPayload = {
        message_content: text,
        patient_id: patientId,
        tagged_user_ids: taggedUserIds
      };
      
      const response = await chatService.sendMessage(requestPayload);
      
      mentionMapRef.current.clear();
      
      const now = new Date();
      setMessages(prev => ([
        ...prev,
        {
          id: response.message_id.toString(),
          chatId: patientId,
          sender: 'me' as const,
          text,
          at: now.toLocaleString(),
          senderName: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : undefined,
          senderId: currentUser ? currentUser.user_id : undefined,
        }
      ]));
      
      setDraftMessage('');
      setShowMentionDropdown(false);
      setIsUserTyping(false); // Resume polling after sending
      
      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // Reload messages with current user ID to ensure proper sender detection
      // Don't show loader for this refresh as it's immediate after sending
      await loadPatientMessages(patientId, currentUser?.user_id || currentUserId, false);
      
      // Notify parent to refresh unread messages
      if (onMessagesUpdated) {
        onMessagesUpdated();
      }
    } catch (error) {
      setIsUserTyping(false); // Resume polling even on error
      const now = new Date();
      setMessages(prev => ([
        ...prev,
        {
          id: `loc-${now.getTime()}`,
          chatId: patientId,
          sender: 'me' as const,
          text,
          at: now.toLocaleString(),
          senderName: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : undefined,
          senderId: currentUser ? currentUser.user_id : undefined,
        }
      ]));
      setDraftMessage('');
      setShowMentionDropdown(false);
      setIsUserTyping(false); // Resume polling after error
      
      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  };

  // Cleanup polling and typing timeouts on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  const handleMessageChange = (value: string) => {
    setDraftMessage(value);
    
    // Pause polling while user is typing
    setIsUserTyping(true);
    
    // Clear existing typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Resume polling after user stops typing for TYPING_TIMEOUT_MS
    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
    }, TYPING_TIMEOUT_MS);
    
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (textAfterAt.includes(' ') || textAfterAt.includes('\n')) {
        setShowMentionDropdown(false);
        return;
      }
      
      const searchQuery = textAfterAt.toLowerCase();
      const filtered = users.filter(user => {
        const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
        const email = user.email.toLowerCase();
        return fullName.includes(searchQuery) || email.includes(searchQuery);
      });
      
      if (filtered.length > 0) {
        setMentionSuggestions(filtered);
        setMentionIndex(lastAtIndex);
        setSelectedMentionIndex(0);
        setShowMentionDropdown(true);
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  const handleMentionSelect = (user: UserListItem) => {
    if (mentionIndex === -1) return;
    
    const textBefore = draftMessage.substring(0, mentionIndex);
    const textAfter = draftMessage.substring(mentionIndex + 1);
    const cursorPos = inputRef.current?.selectionStart || mentionIndex + 1;
    const textAfterCursor = textAfter.substring(0, cursorPos - mentionIndex - 1);
    const spaceIndex = textAfterCursor.indexOf(' ');
    const endIndex = spaceIndex !== -1 ? spaceIndex : textAfterCursor.length;
    
    const mentionText = `@${user.first_name} ${user.last_name}`;
    const newMessage = textBefore + mentionText + ' ' + textAfter.substring(endIndex + 1);
    
    mentionMapRef.current.set(mentionText.toLowerCase().trim(), user.user_id);
    
    setDraftMessage(newMessage);
    setShowMentionDropdown(false);
    setMentionIndex(-1);
    
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = textBefore.length + mentionText.length + 1;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionDropdown && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < mentionSuggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : prev);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(mentionSuggestions[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionDropdown(false);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSendDraft();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[65vw] max-w-[700px] h-[70vh] bg-white rounded-lg border border-[#E7E1E1] shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-black">Stakeholder Chats</h3>
                <p className="text-[11px] text-gray-500">Receive message from stakeholders and team members</p>
              </div>
            </div>
            <button className="p-2 rounded-full hover:bg-gray-100" onClick={onClose}>
              <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        {/* Body - Group Chat Layout */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4">
            {loadingMessages ? (
              <div className="text-center text-xs text-gray-500 mt-10">Loading messages...</div>
            ) : messages.length > 0 ? (
              (() => {
                const firstUnreadIndex = messages.findIndex(m => m.wasUnread === true);
                const hasUnreadMessages = firstUnreadIndex !== -1;
                
                return messages.map((m, index) => {
                  const showUnreadSeparator = hasUnreadMessages && index === firstUnreadIndex;
                  
                  return (
                    <div key={m.id}>
                      {showUnreadSeparator && (
                        <div ref={unreadSeparatorRef} className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-gray-300"></div>
                          <span className="text-xs font-medium text-gray-500 px-2">Unread messages</span>
                          <div className="flex-1 h-px bg-gray-300"></div>
                        </div>
                      )}
                      
                      {m.sender === 'them' ? (
                        <div className="flex items-start gap-3 mb-4">
                          <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-800 text-xs font-semibold flex-shrink-0">
                            {(m.senderName || 'Unknown').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-black">{m.senderName || 'Unknown'}</span>
                              <span className="text-xs text-gray-500">Admin</span>
                            </div>
                            <div className="bg-gray-100 rounded-lg px-3 py-2 inline-block">
                              <div className="text-sm whitespace-pre-wrap" style={{ color: '#000000' }}>
                                {renderMessageWithMentions(m.text)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end mb-4">
                          <div className="max-w-[70%]">
                            <div className="bg-purple-50 rounded-lg px-3 py-2 inline-block">
                              <div className="text-sm whitespace-pre-wrap" style={{ color: '#000000' }}>
                                {renderMessageWithMentions(m.text)}
                              </div>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-1 text-right">{m.at}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            ) : (
              <div className="text-center text-xs text-gray-500 mt-10">
                {patientId ? 'No messages yet. Start the conversation!' : 'No messages to display'}
              </div>
            )}
          </div>
          
          {/* Composer */}
          <div className="px-6 py-4 border-t bg-gray-50 relative">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={patientId ? 'Type a message… (use @ to mention)' : 'Type a message…'}
                  value={draftMessage}
                  onChange={(e) => handleMessageChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!patientId}
                  className="w-full min-h-[44px] max-h-32 py-2.5 px-4 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white shadow-sm"
                />
                {/* Mention dropdown */}
                {showMentionDropdown && mentionSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-2 w-full bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {mentionSuggestions.map((user, index) => (
                      <button
                        key={user.user_id}
                        type="button"
                        onClick={() => handleMentionSelect(user)}
                        className={`w-full text-left px-3 py-2 hover:bg-purple-50 flex items-center gap-2 ${
                          index === selectedMentionIndex ? 'bg-purple-50' : ''
                        }`}
                      >
                        <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-800 text-xs font-semibold">
                          {user.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                          </div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button 
                disabled={!patientId || !draftMessage.trim()} 
                onClick={handleSendDraft} 
                className={`min-w-[44px] h-[44px] rounded-lg flex items-center justify-center transition-all duration-200 shadow-sm ${
                  (!patientId || !draftMessage.trim()) 
                    ? 'bg-gray-300 cursor-not-allowed' 
                    : 'bg-[#8d2b8f] hover:bg-[#7a2473] active:bg-[#6a1f64] cursor-pointer'
                }`}
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14A1 1 0 003 18h14a1 1 0 00.894-1.447l-7-14z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StakeholderChatBox;

