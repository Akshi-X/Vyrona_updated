import { useParams, Link, useNavigate } from 'react-router-dom';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import QualityTrackingChart from './sections/QualityTrackingChart.tsx';
import TrackAndTraceMap from './sections/TrackAndTraceMap.tsx';
import QualityParametersTable from './sections/QualityParametersTable.tsx';
import ThreePLTable from './sections/ThreePLTable.tsx';
import ComplianceCard from './sections/ComplianceCard.tsx';
import NonComplianceCard from './sections/NonComplianceCard.tsx';
import TransportTimeComparison from './sections/TransportTimeComparison.tsx';
import AuditTrailTable from './sections/AuditTrailTable.tsx';
import FrequentlyMissedDocs from './sections/FrequentlyMissedDocs.tsx';
import RiskPanel from './sections/RiskPanel.tsx';
import HistoricLaneRiskAssessment from './sections/HistoricLaneRiskAssessment.tsx';
import PatientSummaryIcon from '../../assets/TrackAndTraceIcons/PatientSummary.svg';
import ApheresisIcon from '../../assets/TrackAndTraceIcons/Apheresis.svg';
import DarkCryopreservationIcon from '../../assets/TrackAndTraceIcons/DarkCryopreservation.svg';
import DarkTransportationIcon from '../../assets/TrackAndTraceIcons/DarkTransportation.svg';
import PreReIcon from '../../assets/TrackAndTraceIcons/Pre-Reengineering.svg';
import PostReIcon from '../../assets/TrackAndTraceIcons/Post-Reengineering.svg';
import LightCryopreservationIcon from '../../assets/TrackAndTraceIcons/LightCryopreservation.svg';
import LightTransportationIcon from '../../assets/TrackAndTraceIcons/LightTransportation.svg';
import ReinfusionIcon from '../../assets/TrackAndTraceIcons/Reinfusion.svg';

// Header icons & modals (reuse from Dashboard)
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import PatientSummaryAlertModal from '../../components/PatientSummaryAlertModal';
import { criticalAlertsService, type CriticalAlert as ServiceCriticalAlert } from '../../services/criticalAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { userService, type UserListItem, type UserProfileDto } from '../../services/userService';
import { chatService } from '../../services/chatService';

export default function TrackPage() {
  const { patientId } = useParams();
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Header interactions state (mirrors Dashboard behavior)
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);
  const [showStakeholderChatScreen, setShowStakeholderChatScreen] = useState(false);
  const [showPatientSummaryAlert, setShowPatientSummaryAlert] = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState<ServiceCriticalAlert[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [userInitials, setUserInitials] = useState<string>('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const unreadSeparatorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserListItem[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  // Store mention mappings: "@FirstName LastName" -> user_id
  const mentionMapRef = useRef<Map<string, string>>(new Map());

  type ChatMessage = { id: string; chatId: string; sender: 'me' | 'them'; text: string; at: string; senderName?: string; senderId?: string; isRead?: boolean; readAt?: string; wasUnread?: boolean };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stakeholderChats, setStakeholderChats] = useState<Array<{ id: string; sender: string; patientId: string; message: string; timestamp: string; isRead: boolean }>>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);

  const stakeholderChatCount = stakeholderChats.length;
  const criticalAlertsCount = criticalAlerts.length;
  const myTasksCount = myTasks.length;

  const fetchCriticalAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const response = await criticalAlertsService.getCriticalAlerts('pharma_12345');
      setCriticalAlerts(response.alerts || []);
    } catch (e) {
      setCriticalAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await tasksService.getMyTasks();
      // Combine created_tasks and assigned_tasks into a single array
      const allTasks = [
        ...(response.created_tasks || []),
        ...(response.assigned_tasks || [])
      ];
      setMyTasks(allTasks);
    } catch (e) {
      console.error('Error fetching tasks:', e);
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const profile = await userService.getProfile();
      setCurrentUser(profile);
      setCurrentUserId(profile.user_id);
    } catch (error) {
      console.error('Error fetching current user profile:', error);
    }
  };

  useEffect(() => {
    fetchCriticalAlerts();
    fetchMyTasks();
    fetchUsers();
    fetchUnreadMessages();
    fetchCurrentUser();
  }, []);

  // Fetch unread messages to populate stakeholder chats
  const fetchUnreadMessages = async () => {
    try {
      const response = await chatService.getUnreadMessages();
      const transformedChats = response.unread_messages.map((msg) => ({
        id: msg.patient_id,
        sender: msg.sender_name,
        patientId: `Patient ID : ${msg.patient_id}`,
        message: msg.message_content,
        timestamp: new Date(msg.created_at).toLocaleString(),
        isRead: false
      }));
      setStakeholderChats(transformedChats);
    } catch (error) {
      console.error('Error fetching unread messages:', error);
      setStakeholderChats([]);
    }
  };

  // Load messages for selected patient (this will mark them as read)
  const loadPatientMessages = async (patientId: string) => {
    if (!patientId) return;
    setLoadingMessages(true);
    try {
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
        // Determine if message is from "me" or "them"
        const isFromMe = msg.sender_id === currentUserId;
        // Check if this message was unread before opening (before it was marked as read)
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
          // Mark as unread if it was unread before opening (for separator display)
          wasUnread: wasUnread && !isFromMe,
        };
      });
      setMessages(transformedMessages);
      
      // Refresh unread messages after loading (messages are now marked as read)
      await fetchUnreadMessages();
    } catch (error) {
      console.error('Error loading patient messages:', error);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await userService.getAllUsersInCompany();
      setUsers(response.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    }
  };

  // When opening chat screen, load all messages for group chat
  useEffect(() => {
    if (showStakeholderChatScreen) {
      // Refresh unread messages when opening the chat screen
      fetchUnreadMessages();
      
      // Load messages for the current patient (from URL) in group chat mode
      if (patientId) {
        loadPatientMessages(patientId);
        setActiveChatId(patientId);
      }
    }
  }, [showStakeholderChatScreen, patientId]);

  // Render message text with mentions highlighted in purple
  const renderMessageWithMentions = (text: string): React.ReactNode => {
    if (!text) return text;
    
    // Pattern to match @word or @word1 word2 (where word2 starts with capital - proper name)
    // This pattern matches @ followed by one or two words, but stops at:
    // - End of string
    // - Space followed by lowercase/number (like "hello1" after "@abc")
    // - Space followed by punctuation
    // The pattern: @ followed by word, optionally followed by space + capitalized word (proper name)
    const mentionPattern = /(@[a-zA-Z0-9_-]+(?:\s+[A-Z][a-zA-Z0-9_-]*)?)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let matchCount = 0;
    
    // Reset regex to start from beginning
    mentionPattern.lastIndex = 0;
    
    while ((match = mentionPattern.exec(text)) !== null) {
      // Check what comes after the match to determine if we should include it or stop
      const matchEnd = match.index + match[0].length;
      const charAfterMatch = text[matchEnd];
      
      // Determine the actual mention text (might need to shorten if followed by lowercase)
      let mentionText = match[0];
      let actualEndIndex = matchEnd;
      
      // If there's a space after the match, check if the next word should be included
      // If it's followed by space + lowercase/number, the mention should stop before that space
      if (charAfterMatch === ' ') {
        const charAfterSpace = text[matchEnd + 1];
        // If it's lowercase or a number, the mention should stop before the space
        if (charAfterSpace && /[a-z0-9]/.test(charAfterSpace)) {
          // The mention should only be the part before the trailing space
          mentionText = match[0].trim();
          actualEndIndex = match.index + mentionText.length;
        }
      }
      
      // Add text before the mention (in black)
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        if (beforeText.length > 0) {
          parts.push(
            <span key={`text-before-${match.index}`} style={{ color: '#000000' }}>
              {beforeText}
            </span>
          );
        }
      }
      
      // Add the mention with purple styling (only the mention part)
      parts.push(
        <span key={`mention-${match.index}`} style={{ color: '#8d2b8f', fontWeight: '500' }}>
          {mentionText}
        </span>
      );
      
      // Update lastIndex to the actual end of the mention (before any trailing space)
      lastIndex = actualEndIndex;
      
      matchCount++;
    }
    
    // Add remaining text after the last mention (in black)
    if (lastIndex < text.length) {
      const afterText = text.substring(lastIndex);
      if (afterText.length > 0) {
        parts.push(
          <span key={`text-after-${lastIndex}`} style={{ color: '#000000' }}>
            {afterText}
          </span>
        );
      }
    }
    
    // If no mentions found, return the text in black
    if (matchCount === 0) {
      return <span style={{ color: '#000000' }}>{text}</span>;
    }
    
    return <>{parts}</>;
  };

  // Auto scroll to first unread message when messages change or active chat changes
  useEffect(() => {
    const el = chatScrollRef.current;
    const separatorEl = unreadSeparatorRef.current;
    
    if (el && messages.length > 0) {
      // Check if there are unread messages
      const firstUnreadIndex = messages.findIndex(m => m.wasUnread === true);
      const hasUnreadMessages = firstUnreadIndex !== -1;
      
      // If there's an unread separator, scroll to it; otherwise scroll to bottom
      if (hasUnreadMessages && separatorEl) {
        // Small delay to ensure DOM is fully rendered
        setTimeout(() => {
          if (el && separatorEl) {
            const separatorTop = separatorEl.offsetTop;
            const containerTop = el.offsetTop;
            // Scroll to the separator with some offset from the top of the container
            el.scrollTop = separatorTop - containerTop - 20; // 20px offset from top
          }
        }, 150);
      } else {
        // No unread messages, scroll to bottom
        setTimeout(() => {
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        }, 100);
      }
    }
  }, [messages, activeChatId, showStakeholderChatScreen]);

  // Extract mentions from message text and map to user IDs
  const extractMentions = (messageText: string): string[] => {
    if (!messageText || typeof messageText !== 'string') {
      console.warn('Invalid message text for mention extraction');
      return [];
    }
    
    if (!users || users.length === 0) {
      console.warn('No users available for mention extraction');
      return [];
    }
    
    console.log('=== EXTRACTING MENTIONS ===');
    console.log('Message text:', messageText);
    console.log('Available users:', users.map(u => `${u.first_name} ${u.last_name} (${u.user_id})`));
    console.log('Mention map size:', mentionMapRef.current.size);
    console.log('Mention map entries:', Array.from(mentionMapRef.current.entries()));
    
    const mentionedUserIds: string[] = [];
    
    // Match @FirstName LastName pattern (allowing for spaces in names)
    // Multiple patterns to catch different formats:
    // 1. @FirstName LastName (space separated)
    // 2. @FirstName MiddleName LastName (multiple spaces)
    // 3. @FirstName (single name)
    // Pattern matches until space, newline, punctuation, or end of string
    const mentionPatterns = [
      /@([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)+)/g,  // @FirstName LastName (multiple words)
      /@([a-zA-Z0-9_-]+)/g  // @FirstName (single word)
    ];
    
    const allMatches: Array<{text: string, index: number}> = [];
    
    // Collect all matches from all patterns
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
    
    // Remove duplicates and sort by index (preserve order)
    const uniqueMatches = Array.from(
      new Map(allMatches.map(m => [m.text.toLowerCase(), m])).values()
    ).sort((a, b) => a.index - b.index);
    
    console.log(`Found ${uniqueMatches.length} unique mention patterns:`, uniqueMatches.map(m => m.text));
    
    for (const match of uniqueMatches) {
      const mentionText = match.text; // e.g., "@John Doe"
      const fullName = mentionText.substring(1).trim(); // Remove @ symbol
      const mentionKey = mentionText.toLowerCase().trim();
      
      console.log(`Processing mention: ${mentionText} (key: ${mentionKey})`);
      
      // First, try to find in the stored mention map (from dropdown selection)
      if (mentionMapRef.current.has(mentionKey)) {
        const userId = mentionMapRef.current.get(mentionKey)!;
        if (userId && typeof userId === 'string' && userId.trim().length > 0) {
          mentionedUserIds.push(userId.trim());
          console.log(`✓ Found mention in map: ${mentionKey} -> ${userId}`);
          continue;
        } else {
          console.warn(`✗ Invalid user ID in map for ${mentionKey}: ${userId}`);
        }
      }
      
      // Try to match by name
      const nameParts = fullName.split(/\s+/).filter(part => part.length > 0);
      console.log(`Name parts:`, nameParts);
      
      let foundUser = false;
      
      if (nameParts.length >= 2) {
        // Try to match with first name and last name
        const firstName = nameParts[0].trim();
        const lastName = nameParts[nameParts.length - 1].trim();
        
        console.log(`Looking for user: firstName="${firstName}", lastName="${lastName}"`);
        
        // Find user by first name and last name (case-insensitive)
        const user = users.find(u => {
          if (!u.user_id || !u.first_name || !u.last_name) return false;
          const uFirst = u.first_name.toLowerCase().trim();
          const uLast = u.last_name.toLowerCase().trim();
          const matchFirst = uFirst === firstName.toLowerCase().trim();
          const matchLast = uLast === lastName.toLowerCase().trim();
          console.log(`  Comparing with: ${u.first_name} ${u.last_name} -> first=${matchFirst}, last=${matchLast}`);
          return matchFirst && matchLast;
        });
        
        if (user && user.user_id) {
          mentionedUserIds.push(user.user_id.trim());
          console.log(`✓ Found mention: @${fullName} -> ${user.user_id} (${user.first_name} ${user.last_name})`);
          foundUser = true;
        } else {
          // Fallback: try to match by full name (first + last)
          const fullNameLower = fullName.toLowerCase().trim();
          console.log(`Trying fallback match for: "${fullNameLower}"`);
          
          const userByFullName = users.find(u => {
            if (!u.user_id || !u.first_name || !u.last_name) return false;
            const userFullName = `${u.first_name} ${u.last_name}`.toLowerCase().trim();
            const exactMatch = userFullName === fullNameLower;
            const startsMatch = userFullName.startsWith(fullNameLower);
            console.log(`  Comparing "${userFullName}" with "${fullNameLower}" -> exact=${exactMatch}, starts=${startsMatch}`);
            return exactMatch || startsMatch;
          });
          
          if (userByFullName && userByFullName.user_id) {
            mentionedUserIds.push(userByFullName.user_id.trim());
            console.log(`✓ Found mention (fallback): @${fullName} -> ${userByFullName.user_id} (${userByFullName.first_name} ${userByFullName.last_name})`);
            foundUser = true;
          }
        }
      } else if (nameParts.length === 1) {
        // Single name mention - try to match by first name only
        const firstName = nameParts[0].trim();
        console.log(`Single name mention: "${firstName}"`);
        
        const user = users.find(u => {
          if (!u.user_id || !u.first_name) return false;
          const match = u.first_name.toLowerCase().trim() === firstName.toLowerCase().trim();
          if (match) console.log(`  Matched with: ${u.first_name} ${u.last_name}`);
          return match;
        });
        
        if (user && user.user_id) {
          mentionedUserIds.push(user.user_id.trim());
          console.log(`✓ Found mention (first name only): @${firstName} -> ${user.user_id} (${user.first_name} ${user.last_name})`);
          foundUser = true;
        }
      }
      
      if (!foundUser) {
        console.warn(`✗ Could not find user for mention: ${mentionText}`);
        console.warn('Available users:', users.map(u => `  - ${u.first_name} ${u.last_name} (${u.user_id})`).join('\n'));
      }
    }
    
    // Remove duplicates and validate user IDs
    const uniqueIds = Array.from(new Set(mentionedUserIds))
      .filter(id => id && typeof id === 'string' && id.trim().length > 0);
    
    console.log(`=== EXTRACTION RESULT: ${uniqueIds.length} unique mentions ===`);
    console.log('Extracted user IDs:', uniqueIds);
    
    if (uniqueIds.length === 0 && messageText.includes('@')) {
      console.error('⚠️ WARNING: Message contains @ but no user IDs were extracted!');
      console.error('Message:', messageText);
      console.error('Mention map:', Array.from(mentionMapRef.current.entries()));
    }
    
    return uniqueIds;
  };

  const handleSendDraft = async () => {
    const text = draftMessage.trim();
    if (!patientId || !text) return;
    
    try {
      // Ensure users are loaded before extracting mentions
      if (users.length === 0) {
        console.log('Users not loaded, fetching users...');
        await fetchUsers();
      }
      
      // Extract mentioned users from message text
      let taggedUserIds = extractMentions(text);
      
      // Validate that we have user IDs (not empty strings or undefined)
      taggedUserIds = taggedUserIds.filter(id => id && typeof id === 'string' && id.trim().length > 0);
      
      // Debug: Log mentions for troubleshooting
      console.log('=== MESSAGE SENDING ===');
      console.log('Message text:', text);
      console.log('Available users:', users.length);
      console.log('Mention map size:', mentionMapRef.current.size);
      console.log('Mention map entries:', Array.from(mentionMapRef.current.entries()));
      console.log('Extracted mentions (before validation):', taggedUserIds);
      
      // Final validation: ensure tagged_user_ids is always an array
      if (!Array.isArray(taggedUserIds)) {
        console.warn('tagged_user_ids is not an array, converting...');
        taggedUserIds = [];
      }
      
      console.log('Final tagged_user_ids to send:', taggedUserIds);
      
      // Send message via API - use patientId from URL params for group chat
      // Always send tagged_user_ids as array (even if empty) for consistency
      const requestPayload = {
        message_content: text,
        patient_id: patientId,
        tagged_user_ids: taggedUserIds // Always send as array
      };
      
      console.log('Sending message with payload:', JSON.stringify(requestPayload, null, 2));
      console.log('Payload tagged_user_ids type:', Array.isArray(requestPayload.tagged_user_ids));
      console.log('Payload tagged_user_ids length:', requestPayload.tagged_user_ids.length);
      
      const response = await chatService.sendMessage(requestPayload);
      
      console.log('Message sent successfully. Response:', response);
      console.log('Tagged user IDs in response:', response.tagged_user_ids);
      
      // Clear mention map after successful send to avoid stale data
      mentionMapRef.current.clear();
      
      // Add message to local state
      const now = new Date();
      const currentUser = await userService.getProfile();
      setMessages(prev => ([
        ...prev,
        {
          id: response.message_id.toString(),
          chatId: patientId,
          sender: 'me' as const,
          text,
          at: now.toLocaleString(),
          senderName: `${currentUser.first_name} ${currentUser.last_name}`,
          senderId: currentUser.user_id,
        }
      ]));
      
      setDraftMessage('');
      setShowMentionDropdown(false);
      
      // Reload messages for the current patient to show the new message
      await loadPatientMessages(patientId);
      
      // Refresh unread messages to update stakeholder chats (for mentioned users)
      await fetchUnreadMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      // Still add to local state for optimistic UI
      const now = new Date();
      try {
        const currentUser = await userService.getProfile();
        setMessages(prev => ([
          ...prev,
          {
            id: `loc-${now.getTime()}`,
            chatId: patientId,
            sender: 'me' as const,
            text,
            at: now.toLocaleString(),
            senderName: `${currentUser.first_name} ${currentUser.last_name}`,
            senderId: currentUser.user_id,
          }
        ]));
      } catch {
        // If getProfile fails, add message without sender info
        setMessages(prev => ([
          ...prev,
          {
            id: `loc-${now.getTime()}`,
            chatId: patientId,
            sender: 'me' as const,
            text,
            at: now.toLocaleString(),
          }
        ]));
      }
      setDraftMessage('');
      setShowMentionDropdown(false);
    }
  };

  const handleMessageChange = (value: string) => {
    setDraftMessage(value);
    
    // Check for @ mention
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if there's a space after @ (mention ended)
      if (textAfterAt.includes(' ') || textAfterAt.includes('\n')) {
        setShowMentionDropdown(false);
        return;
      }
      
      // Filter users based on search query
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
    
    // Store the mapping for this mention
    mentionMapRef.current.set(mentionText.toLowerCase().trim(), user.user_id);
    console.log(`Stored mention mapping: "${mentionText}" -> ${user.user_id} (${user.first_name} ${user.last_name})`);
    
    setDraftMessage(newMessage);
    setShowMentionDropdown(false);
    setMentionIndex(-1);
    
    // Set cursor position after mention
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

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
        setUserInitials(initials);
        setCurrentUserId(profile.user_id);
      } catch {
        setUserInitials('U');
      }
    };
    fetchUserProfile();
  }, []);

  const transformedTasks: MyTask[] = myTasks.map(task => ({
    id: task.id.toString(),
    patientId: task.patient_id || 'N/A',
    taskName: task.task_name,
    description: task.description || '',
    assigneeBy: `${task.created_by.first_name} ${task.created_by.last_name}`,
    dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A',
    priority: task.priority,
    status: task.status
  }));

  return (
    <div className="bg-[#fcfaff] flex w-full" style={{ height: '100vh' }}>
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-hidden ml-60">
        {/* Top Black Bar */}
        <header className="h-[63px] bg-black flex items-center justify-end px-6 gap-6 flex-shrink-0">
          {/* Avatar only on the black bar */}
          <div className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{userInitials}</span>
          </div>
        </header>

        {/* Subheader with patient summary and icons */}
        <div className="bg-[#ffffff] border-b border-[#E7E1E1] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center text-black text-sm font-semibold">
            <Link to="/dashboard" className="mr-3 text-black">←</Link>
            <span>Patient ID: {patientId} - Condition Unknown</span>
          </div>
          <div className="flex items-center gap-6">
            {/* Critical Alerts */}
            <div className="relative group">
              <img
                className="w-[22px] h-[22px] cursor-pointer"
                alt="Critical Alerts"
                src={CriticalAlertsIcon}
                onClick={() => { fetchCriticalAlerts(); setShowCriticalAlerts(true); }}
              />
              {criticalAlertsCount > 0 && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
                </div>
              )}
            </div>
            {/* Stakeholder Chats */}
            <div className="relative group">
              <img
                className="w-[22px] h-[22px] cursor-pointer"
                alt="Stakeholder Chats"
                src={StakeholderChatsIcon}
                onClick={() => setShowStakeholderChatScreen(true)}
              />
              {stakeholderChatCount > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{stakeholderChatCount}</span>
                </div>
              )}
            </div>
            {/* My Tasks */}
            <div className="relative group">
              <img
                className="w-[22px] h-[22px] cursor-pointer"
                alt="My Tasks"
                src={MyTasksIcon}
                onClick={() => { fetchMyTasks(); setShowMyTasks(true); }}
              />
              {myTasksCount > 0 && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
                </div>
              )}
            </div>
             {/* Patient Summary */}
             <div className="relative group">
              <img
                className="w-[22px] h-[22px] cursor-pointer"
                alt="Patient Summary"
                src={PatientSummaryIcon}
                onClick={() => {
                  if (patientId) {
                    setShowPatientSummaryAlert(true);
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Stakeholder Chat Screen (overlay) */}
        {showStakeholderChatScreen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowStakeholderChatScreen(false)}>
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
                  <button className="p-2 rounded-full hover:bg-gray-100" onClick={() => setShowStakeholderChatScreen(false)}>
                    <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
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
                      // Find the first message that was unread before opening (for separator display)
                      const firstUnreadIndex = messages.findIndex(m => m.wasUnread === true);
                      const hasUnreadMessages = firstUnreadIndex !== -1;
                      
                      return messages.map((m, index) => {
                        // Show unread separator before the first message that was unread
                        const showUnreadSeparator = hasUnreadMessages && index === firstUnreadIndex;
                        
                        return (
                          <div key={m.id}>
                            {/* Unread messages separator */}
                            {showUnreadSeparator && (
                              <div ref={unreadSeparatorRef} className="flex items-center gap-3 my-4">
                                <div className="flex-1 h-px bg-gray-300"></div>
                                <span className="text-xs font-medium text-gray-500 px-2">Unread messages</span>
                                <div className="flex-1 h-px bg-gray-300"></div>
                              </div>
                            )}
                            
                            {/* Message content */}
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
                  <div className="p-4 border-t relative">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          ref={inputRef}
                          type="text"
                          placeholder={patientId ? 'Type a message… (use @ to mention)' : 'Type a message…'}
                          value={draftMessage}
                          onChange={(e) => handleMessageChange(e.target.value)}
                          onKeyDown={handleKeyDown}
                          disabled={!patientId}
                          className="w-full h-10 border rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:bg-gray-100"
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
                      <button disabled={!patientId || !draftMessage.trim()} onClick={handleSendDraft} className={`w-9 h-9 rounded-md flex items-center justify-center ${(!patientId || !draftMessage.trim()) ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#8d2b8f]'}`}>
                        <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14A1 1 0 003 18h14a1 1 0 00.894-1.447l-7-14z"/></svg>
                      </button>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
          {/* Top progress rail with icons */}
          <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
            <div className="flex items-center justify-between">
              {/* Left segment with dark icons and solid connector */}
              <div className="flex items-center gap-0 flex-1">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={ApheresisIcon} alt="Apheresis" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Apheresis</div>
                </div>
                <div className="h-[3px] bg-[#8d2b8f] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={DarkCryopreservationIcon} alt="Cryopreservation" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Cryopreservation</div>
                </div>
                <div className="h-[3px] bg-[#8d2b8f] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={DarkTransportationIcon} alt="Transportation" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Transportation</div>
                </div>
                <div className="h-[3px] bg-[#8d2b8f] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={PreReIcon} alt="Pre-Reengineering" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Pre-Reengineering</div>
                </div>
                {/* dotted connector to light phase */}
                <div className="flex-1 ">
                  <div className="w-full h-[3px] bg-[repeating-linear-gradient(90deg,_#8d2b8f,_#8d2b8f_6px,_transparent_6px,_transparent_12px)] rounded-full opacity-70" />
                </div>
              </div>

              {/* Right segment with light icons */}
              <div className="flex items-center gap-0 flex-1">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={PostReIcon} alt="Post-Reengineering" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Post-Reengineering</div>
                </div>
                <div className="h-[3px] bg-[#f1dff5] rounded-full flex-1" />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={LightCryopreservationIcon} alt="Cryopreservation" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Cryopreservation</div>
                </div>
                <div className="h-[3px] bg-[#f1dff5] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={LightTransportationIcon} alt="Transportation" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Transportation</div>
                </div>
                <div className="h-[3px] bg-[#f1dff5] rounded-full flex-1 -ml-3 -mr-3" />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={ReinfusionIcon} alt="Reinfusion" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Reinfusion</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quality Tracking + Track and Trace */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <QualityTrackingChart />
              <TrackAndTraceMap />
          </div>

          {/* Quality Parameter + 3PL */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <QualityParametersTable />
              <ThreePLTable />
          </div>

          {/* Compliance / Non-Compliance / Transport Time Comparison */}
          <div className="grid grid-cols-[5fr_1fr_6fr] gap-6">
            <ComplianceCard />
            <NonComplianceCard />
            <TransportTimeComparison />
          </div>

          {/* Audit Trail / Frequently Missed Docs / Risk */}
          <div className="grid grid-cols-[5fr_1fr_6fr] gap-6">
            <AuditTrailTable />
            <FrequentlyMissedDocs />
            <RiskPanel />
          </div>

          {/* Historic Lane Risk Assessment */}
          <div>
            <HistoricLaneRiskAssessment />
          </div>
        </div>
      </main>
      
      {/* Modals */}
      <CriticalAlertsModal
        isOpen={showCriticalAlerts}
        onClose={() => setShowCriticalAlerts(false)}
        alerts={criticalAlerts.map((a) => ({
          id: a.id,
          type: a.type,
          severity: a.severity,
          patientId: a.patient_id,
          message: a.message,
          timestamp: a.timestamp,
          status: a.status,
        }))}
        loading={loadingAlerts}
      />
      <MyTasksModal
        isOpen={showMyTasks}
        onClose={() => setShowMyTasks(false)}
        tasks={transformedTasks}
        loading={loadingTasks}
        variant="track"
        currentUserName={currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : ''}
        currentUserId={currentUserId}
        onTaskCreated={() => {
          // Refresh tasks after creation
          fetchMyTasks();
        }}
        onAdd={() => {
          // This is called after successful task creation
          console.log('Task added successfully');
        }}
        onEdit={(task) => {
          // TODO: Implement edit task functionality
          console.log('Edit task clicked:', task);
        }}
        onDelete={(taskId) => {
          // TODO: Implement delete task functionality
          console.log('Delete task clicked:', taskId);
        }}
      />
      {/* Legacy modal retained but not used by icon click */}
      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={stakeholderChats}
      />

      {/* Patient Summary Alert Modal */}
      {patientId && (
        <PatientSummaryAlertModal
          isOpen={showPatientSummaryAlert}
          onClose={() => setShowPatientSummaryAlert(false)}
          patientId={patientId}
          onViewSummary={() => {
            // Already on track page, could scroll or highlight if needed
          }}
        />
      )}
    </div>
  );
}



