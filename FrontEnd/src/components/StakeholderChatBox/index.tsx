import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { chatService } from '../../services/chatService';
import { userService, type UserListItem } from '../../services/userService';
import renderMessageWithMentions from './utils/renderMessageWithMentions';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { usePatientChatWebSocket, useCanisterChatWebSocket, useIncubatorChatWebSocket, useRefrigeratorChatWebSocket } from '../../hooks/useChatWebSocket';

const formatTimestamp = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

type ChatMessage = { 
  id: string; 
  chatId: string; 
  sender: 'me' | 'them'; 
  text: string; 
  at: string; 
  senderName?: string; 
  senderId?: string; 
  senderRole?: string; 
  isRead?: boolean; 
  readAt?: string; 
  wasUnread?: boolean 
};

interface StakeholderChatBoxProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string | undefined; // For CGT flow
  canisterNumber?: string | undefined; // For IVF flow
  incubatorId?: number | undefined; // For Incubator flow
  chamberId?: string | undefined; // For Incubator flow (optional chamber scope)
  refrigeratorId?: number | undefined; // For Refrigerator flow
  zoneId?: string | undefined; // For Refrigerator flow (optional zone scope)
  onMessagesUpdated?: () => void; // Callback to refresh unread messages in parent
  embedded?: boolean; // Render inline (no modal backdrop/wrapper)
}

const StakeholderChatBox: React.FC<StakeholderChatBoxProps> = ({
  isOpen,
  onClose,
  patientId,
  canisterNumber,
  incubatorId,
  chamberId,
  refrigeratorId,
  zoneId,
  onMessagesUpdated,
  embedded = false,
}) => {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const unreadSeparatorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement | null>(null);
  const mentionItemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const mentionMapRef = useRef<Map<string, string>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMarkedAsReadRef = useRef(false);
  const previousUnreadCountRef = useRef<number>(0);
  const previousMessageCountRef = useRef<number>(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserListItem[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  // Determine which flow is active (exactly one should be set)
  // Treat empty strings as falsy to avoid sending empty patient_id
  const isCGTFlow = !!(patientId && patientId.trim());
  const isIVFFlow = !!(canisterNumber && canisterNumber.trim());
  const isIncubatorFlow = !!(incubatorId != null);
  const isRefrigeratorFlow = !!(refrigeratorId != null);
  const chatIdentifier =
    (patientId && patientId.trim()) ||
    (canisterNumber && canisterNumber.trim()) ||
    (incubatorId != null ? incubatorId.toString() : undefined) ||
    (refrigeratorId != null ? refrigeratorId.toString() : undefined);

  // WebSocket hooks — only the active one actually connects
  const patientWs = usePatientChatWebSocket(isCGTFlow ? patientId : undefined);
  const canisterWs = useCanisterChatWebSocket(isIVFFlow ? canisterNumber : undefined);
  const incubatorWs = useIncubatorChatWebSocket(isIncubatorFlow ? incubatorId : undefined, chamberId);
  const refrigeratorWs = useRefrigeratorChatWebSocket(isRefrigeratorFlow ? refrigeratorId : undefined, zoneId);

  // Use the appropriate WebSocket hook based on flow
  const { messages: wsMessages, unreadCount, markAsRead, refreshMessages } = isRefrigeratorFlow
    ? refrigeratorWs
    : isIncubatorFlow
      ? incubatorWs
      : isCGTFlow
        ? patientWs
        : canisterWs;

  // Fetch current user
  const fetchCurrentUser = async (): Promise<void> => {
    try {
      const profile = await userService.getProfile();
      setCurrentUserId(profile.user_id);
    } catch {
      // Silently handle error
    }
  };

  // Fetch users for mention functionality
  // Keep ALL users (including current user) for rendering mentions in messages
  // Current user will be filtered out only in the mention dropdown suggestions
  const fetchUsers = async () => {
    try {
      const response = await userService.getAllUsersInCompany();
      const allUsers = response.users || [];
      setUsers(allUsers);
    } catch {
      setUsers([]);
    }
  };

  // Transform WebSocket messages to ChatMessage format
  useEffect(() => {
    if (!wsMessages || wsMessages.length === 0) {
      setMessages([]);
      return;
    }

    const userIdToCompare = currentUserId;
    
    // Transform messages
    const transformedMessages: ChatMessage[] = wsMessages.map((msg) => {
      // Only determine sender if we have currentUserId
      const isFromMe = Boolean(userIdToCompare && msg.sender_id === userIdToCompare);
      const isRead = Boolean(msg.is_read);
      
      // wasUnread = true if:
      // 1. We have currentUserId (to determine if message is from us)
      // 2. Message is not from current user
      // 3. Message is not read
      // This shows the separator for any unread message from others
      const wasUnread = Boolean(
        userIdToCompare && 
        !isFromMe && 
        !isRead
      );
      
      return {
        id: msg.id.toString(),
        chatId: chatIdentifier || '',
        sender: isFromMe ? 'me' : 'them',
        text: msg.message_content,
        at: formatTimestamp(msg.created_at),
        senderName: msg.sender_name,
        senderId: msg.sender_id,
        senderRole: msg.sender_role || 'User',
        isRead: msg.is_read,
        readAt: msg.read_at,
        wasUnread: wasUnread,
      };
    });

    // Sort by created_at descending (latest first), then reverse for display (oldest first)
    transformedMessages.sort((a, b) => {
      const aTime = new Date(wsMessages.find(m => m.id.toString() === a.id)?.created_at || 0).getTime();
      const bTime = new Date(wsMessages.find(m => m.id.toString() === b.id)?.created_at || 0).getTime();
      return aTime - bTime; // Oldest first for display
    });

    setMessages(transformedMessages);
    
   
  }, [wsMessages, currentUserId, chatIdentifier, isOpen, embedded]);

  // Onboarding: listen for a custom event to pre-fill the draft input.
  // This avoids the React 18 synthetic-event unreliability of the native setter trick.
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text === "string") setDraftMessage(text);
    };
    document.addEventListener("onboarding:set-chat-input", handler);
    return () => document.removeEventListener("onboarding:set-chat-input", handler);
  }, []);

  // Note: Mark as read functionality:
  // 1. When user closes chat dialog (handleClose function)
  // 2. When user sends a message (handleSendDraft function)
  // Auto-mark-as-read when receiving new messages while chat is open is disabled for now

  // Scroll to bottom of chat with retry mechanism
  const scrollToUnreadOrBottom = useCallback((smooth: boolean = false, retryCount: number = 0, force: boolean = false) => {
    const el = chatScrollRef.current;
    
    if (!el || messages.length === 0) return;
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!el) return;
        
        const targetScrollTop = el.scrollHeight - el.clientHeight;
        const currentScrollTop = el.scrollTop;
        const isAtBottom = Math.abs(currentScrollTop - targetScrollTop) < 5; // 5px tolerance
        
        // If already at bottom and not retrying and not forced, skip
        if (isAtBottom && retryCount === 0 && !smooth && !force) {
          return;
        }
        
        // Scroll to bottom
        if (smooth) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth'
          });
        } else {
          // Use scrollTop for instant scroll (more reliable)
          el.scrollTop = el.scrollHeight;
        }
        
        // Verify scroll happened, retry if needed (max 3 retries)
        if (retryCount < 3) {
          setTimeout(() => {
            if (!el) return;
            const newScrollTop = el.scrollTop;
            const newTargetScrollTop = el.scrollHeight - el.clientHeight;
            const stillNotAtBottom = Math.abs(newScrollTop - newTargetScrollTop) > 5;
            
            if (stillNotAtBottom) {
              // Retry with slightly longer delay
              scrollToUnreadOrBottom(smooth, retryCount + 1, force);
            }
          }, 150 + (retryCount * 100)); // Increasing delay for retries
        }
      });
    });
  }, [messages]);

  // Initialize when chat opens (or when mounted in embedded mode)
  useEffect(() => {
    if ((isOpen || embedded) && chatIdentifier) {
      const initializeChat = async () => {
        setLoadingMessages(true);
        await fetchCurrentUser();
        await fetchUsers();
        hasMarkedAsReadRef.current = false;
        previousUnreadCountRef.current = unreadCount;
        setLoadingMessages(false);
      };
      initializeChat();
    } else if (!embedded) {
      // Reset when modal chat closes (not applicable in embedded mode)
      hasMarkedAsReadRef.current = false;
      previousUnreadCountRef.current = 0;
    }
  }, [isOpen, embedded, chatIdentifier, unreadCount, currentUserId]);

  // Scroll to bottom when loading completes and messages are available
  useEffect(() => {
    if (!loadingMessages && messages.length > 0 && (isOpen || embedded)) {
      // Wait a bit longer after loading completes to ensure all content is rendered
      // This ensures we scroll after WebSocket messages are fully loaded
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToUnreadOrBottom(false, 0, true); // Force scroll after loading
          });
        });
      }, 250);
      
      return () => clearTimeout(timeoutId);
    }
  }, [loadingMessages, messages.length, isOpen, scrollToUnreadOrBottom]);

  // Scroll to bottom when chat opens or messages change (initial load)
  useEffect(() => {
    if (messages.length > 0 && (isOpen || embedded) && !loadingMessages) {
      // Force scroll to bottom on initial load to ensure we show latest messages
      // Use multiple requestAnimationFrame calls to ensure content is rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToUnreadOrBottom(false, 0, true); // Force scroll on initial load
        });
      });
    }
  }, [messages, isOpen, loadingMessages, scrollToUnreadOrBottom]);

  // Scroll to bottom smoothly when new messages arrive (user is viewing chat)
  useEffect(() => {
    if (messages.length > 0 && (isOpen || embedded) && !loadingMessages && messages.length > previousMessageCountRef.current) {
      // New message arrived - scroll smoothly to bottom
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToUnreadOrBottom(true); // Smooth scroll for new messages
      });
      
      previousMessageCountRef.current = messages.length;
    } else if (messages.length > 0) {
      previousMessageCountRef.current = messages.length;
    }
  }, [messages.length, isOpen, loadingMessages, scrollToUnreadOrBottom]);

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
    if (!chatIdentifier || !text) return;
    
    // Clear input immediately for better UX
    const messageToSend = text;
    mentionMapRef.current.clear();
    setDraftMessage('');
    setShowMentionDropdown(false);
    
    try {
      if (users.length === 0) {
        await fetchUsers();
      }
      
      let taggedUserIds = extractMentions(messageToSend);
      taggedUserIds = taggedUserIds.filter(id => id && typeof id === 'string' && id.trim().length > 0);
      
      if (!Array.isArray(taggedUserIds)) {
        taggedUserIds = [];
      }
      
      // Build request payload — only include the FK for the active flow
      const requestPayload: {
        message_content: string;
        patient_id?: string;
        tank_code?: string;
        incubator_id?: number;
        chamber_id?: string;
        refrigerator_id?: number;
        zone_id?: string;
        tagged_user_ids: string[];
      } = {
        message_content: messageToSend,
        tagged_user_ids: taggedUserIds
      };

      if (isCGTFlow && patientId && patientId.trim()) {
        requestPayload.patient_id = patientId.trim();
      } else if (isIVFFlow && canisterNumber && canisterNumber.trim()) {
        requestPayload.tank_code = canisterNumber.trim();
      } else if (isIncubatorFlow && incubatorId != null) {
        requestPayload.incubator_id = incubatorId;
        if (chamberId) requestPayload.chamber_id = chamberId;
      } else if (isRefrigeratorFlow && refrigeratorId != null) {
        requestPayload.refrigerator_id = refrigeratorId;
        if (zoneId) requestPayload.zone_id = zoneId;
      }
      
      await chatService.sendMessage(requestPayload);
      
      // Mark as read after sending message (user typed a reply)
      try {
        markAsRead();
      } catch {
        // Fallback to HTTP API if WebSocket fails
        if (isCGTFlow && patientId) {
          chatService.markPatientAsRead(patientId).catch(() => {});
        } else if (isIVFFlow && canisterNumber) {
          chatService.markCanisterAsRead(canisterNumber).catch(() => {});
        } else if (isIncubatorFlow && incubatorId != null) {
          chatService.markIncubatorAsRead(incubatorId, chamberId).catch(() => {});
        } else if (isRefrigeratorFlow && refrigeratorId != null) {
          chatService.markRefrigeratorAsRead(refrigeratorId).catch(() => {});
        }
      }
      hasMarkedAsReadRef.current = true;
      
      // Refresh messages to get updated is_read status (removes unread separator)
      setTimeout(() => {
        refreshMessages();
      }, 200);
      
      // Scroll to bottom after sending message
      setTimeout(() => {
        requestAnimationFrame(() => {
          scrollToUnreadOrBottom(true); // Smooth scroll after sending
        });
      }, 300);
      
      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // Notify parent
      if (onMessagesUpdated) {
        onMessagesUpdated();
      }
    } catch {
      // Input already cleared, just clear dropdown if needed
      setShowMentionDropdown(false);
      
      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  };

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle close - mark as read
  const handleClose = () => {
    if (chatIdentifier && !hasMarkedAsReadRef.current) {
      // Mark as read when closing chat
      // Try WebSocket first, fallback to HTTP API
      try {
        markAsRead();
        // Refresh messages after marking as read (for next time chat opens)
        setTimeout(() => {
          refreshMessages();
        }, 200);
      } catch {
        // Fallback to HTTP API if WebSocket fails
        if (isCGTFlow && patientId) {
          chatService.markPatientAsRead(patientId).catch(() => {});
        } else if (isIVFFlow && canisterNumber) {
          chatService.markCanisterAsRead(canisterNumber).catch(() => {});
        } else if (isIncubatorFlow && incubatorId != null) {
          chatService.markIncubatorAsRead(incubatorId, chamberId).catch(() => {});
        } else if (isRefrigeratorFlow && refrigeratorId != null) {
          chatService.markRefrigeratorAsRead(refrigeratorId).catch(() => {});
        }
      }
      hasMarkedAsReadRef.current = true;
    }
    onClose();
  };

  const handleMessageChange = (value: string) => {
    setDraftMessage(value);
    
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
        // Exclude current user from mention suggestions
        if (currentUserId && user.user_id === currentUserId) {
          return false;
        }
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

  // Auto-scroll dropdown to keep highlighted item in view
  useEffect(() => {
    if (showMentionDropdown && selectedMentionIndex >= 0 && mentionDropdownRef.current) {
      const scrollToItem = (retryCount = 0) => {
        const selectedItem = mentionItemRefs.current.get(selectedMentionIndex);
        const dropdown = mentionDropdownRef.current;
        
        if (selectedItem && dropdown) {
          // Calculate positions relative to the scrollable container
          const itemTop = selectedItem.offsetTop;
          const itemBottom = itemTop + selectedItem.offsetHeight;
          
          const dropdownScrollTop = dropdown.scrollTop;
          const dropdownHeight = dropdown.clientHeight;
          const visibleTop = dropdownScrollTop;
          const visibleBottom = dropdownScrollTop + dropdownHeight;

          // Check if item is above visible area
          if (itemTop < visibleTop) {
            // Scroll to show item at the top with padding
            dropdown.scrollTo({
              top: Math.max(0, itemTop - 8),
              behavior: 'smooth'
            });
          }
          // Check if item is below visible area
          else if (itemBottom > visibleBottom) {
            // Scroll to show item at the bottom with padding
            dropdown.scrollTo({
              top: itemBottom - dropdownHeight + 8,
              behavior: 'smooth'
            });
          }
        } else if (retryCount < 3) {
          // Retry if refs aren't set yet (max 3 retries)
          setTimeout(() => scrollToItem(retryCount + 1), 50);
        }
      };
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        scrollToItem();
      });
    }
  }, [selectedMentionIndex, showMentionDropdown, mentionSuggestions.length]);

  // Cleanup refs when dropdown closes
  useEffect(() => {
    if (!showMentionDropdown) {
      mentionItemRefs.current.clear();
    }
  }, [showMentionDropdown]);

  // Lock body scroll when chat box is open as a modal (not in embedded mode)
  useBodyScrollLock(isOpen && !embedded);

  const effectivelyOpen = isOpen || embedded;
  if (!effectivelyOpen) return null;

  const chatContent = (
    <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4">
            {loadingMessages ? (
              <div className="text-center text-xs text-gray-500 mt-10">Loading messages...</div>
            ) : messages.length > 0 ? (
              (() => {
                // Find first message with wasUnread flag
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
                              <span className="text-xs text-gray-500">{m.senderRole || 'User'}</span>
                            </div>
                            <div className="bg-gray-100 rounded-lg px-3 py-2 inline-block">
                              <div className="text-sm whitespace-pre-wrap" style={{ color: '#000000' }}>
                                {renderMessageWithMentions(m.text, users)}
                              </div>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-1">{m.at}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end mb-4">
                          <div className="max-w-[70%]">
                            <div className="bg-purple-50 rounded-lg px-3 py-2 inline-block">
                              <div className="text-sm whitespace-pre-wrap" style={{ color: '#000000' }}>
                                {renderMessageWithMentions(m.text, users)}
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
              <div className="flex flex-col items-center justify-center gap-2 text-center mt-10 px-4">
                <MessageSquare size={28} strokeWidth={1.5} style={{ color: '#c4a8d8' }} />
                <span className="text-xs text-gray-500">Send a message to all the stakeholders here.</span>
              </div>
            )}
          </div>
          
          {/* Composer */}
          <div className={embedded ? 'px-3 py-2 border-t bg-gray-50 relative' : 'px-6 py-4 border-t bg-gray-50 relative'}>
            <div className={embedded ? 'flex items-end gap-2' : 'flex items-end gap-3'}>
              <div className="flex-1 relative">
                <input
                  id="onboarding-chat-input"
                  ref={inputRef}
                  type="text"
                  placeholder={chatIdentifier ? 'Type a message… (use @ to mention)' : 'Type a message…'}
                  value={draftMessage}
                  onChange={(e) => handleMessageChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!chatIdentifier}
                  className={embedded
                    ? 'w-full min-h-[30px] py-1 px-3 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white shadow-sm'
                    : 'w-full min-h-[44px] max-h-32 py-2.5 px-4 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white shadow-sm'
                  }
                />
                {/* Mention dropdown */}
                {showMentionDropdown && mentionSuggestions.length > 0 && (
                  <div 
                    ref={mentionDropdownRef}
                    className="absolute bottom-full left-0 mb-2 w-full bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto"
                  >
                    {mentionSuggestions.map((user, index) => (
                      <button
                        key={user.user_id}
                        ref={(el) => {
                          if (el) {
                            mentionItemRefs.current.set(index, el);
                          } else {
                            mentionItemRefs.current.delete(index);
                          }
                        }}
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
                id="onboarding-chat-send-btn"
                disabled={!chatIdentifier || !draftMessage.trim()}
                onClick={handleSendDraft}
                className={`${embedded ? 'min-w-[30px] h-[30px]' : 'min-w-[44px] h-[44px]'} rounded-lg flex items-center justify-center transition-all duration-200 shadow-sm ${
                  (!chatIdentifier || !draftMessage.trim())
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-[#8d2b8f] hover:bg-[#7a2473] active:bg-[#6a1f64] cursor-pointer'
                }`}
              >
                <svg className={embedded ? 'w-3.5 h-3.5 text-white' : 'w-5 h-5 text-white'} viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14A1 1 0 003 18h14a1 1 0 00.894-1.447l-7-14z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
  );

  if (embedded) {
    return chatContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent backdrop-blur-sm" onClick={handleClose}>
      <div id="onboarding-stakeholder-chatbox" className="w-[65vw] max-w-[700px] h-[70vh] bg-white rounded-lg border border-line shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
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
            <button id="onboarding-chat-close-btn" className="p-2 rounded-full hover:bg-gray-100" onClick={handleClose}>
              <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        {chatContent}
      </div>
    </div>
  );
};

export default StakeholderChatBox;

