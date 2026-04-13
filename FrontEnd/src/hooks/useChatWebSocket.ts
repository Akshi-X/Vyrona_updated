import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { chatService, type UnreadMessagesResponse, type PatientMessagesResponse } from '../services/chatService';

/**
 * WebSocket hook for Dashboard - tracks unread tagged messages count
 * Does NOT mark messages as read
 */
export function useDashboardChatWebSocket(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessagesResponse['unread_messages']>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const maxReconnectAttempts = import.meta.env.MAX_RECONNECT_ATTEMPTS ;
  const reconnectDelay = import.meta.env.RECONNECT_DELAY ;

  const isIvfUser = useCallback(() => {
    try {
      const dept = localStorage.getItem('department');
      return dept && dept.toUpperCase() === 'IVF';
    } catch {
      return false;
    }
  }, []);

  const getWebSocketUrl = useCallback(() => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/chat/ws`;
  }, []);

  const connect = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (isIvfUser()) {
      return;
    }
    if (!isAuthenticated || !token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = getWebSocketUrl();
      const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        shouldReconnectRef.current = true;
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Request unread messages on connection
        ws.send(JSON.stringify({
          type: 'get_unread_messages'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle connection confirmation
          if (data.type === 'connection_confirmed') {
            if (data.unread_messages) {
              setUnreadCount(data.unread_messages.total_unread || 0);
              setUnreadMessages(data.unread_messages.unread_messages || []);
            }
            return;
          }

          // Handle unread messages response
          if (data.type === 'unread_messages' && data.success && data.data) {
            setUnreadCount(data.data.total_unread || 0);
            setUnreadMessages(data.data.unread_messages || []);
            return;
          }

          // Handle new message broadcast
          if (data.type === 'new_message' && data.data) {
            // Refresh unread count
            ws.send(JSON.stringify({
              type: 'get_unread_messages'
            }));
            return;
          }

          // Handle error
          if (data.type === 'error') {
            console.error('[Dashboard Chat WS] Error:', data.message);
            // If auth fails (e.g. missing pharma_id), stop reconnect loop
            if (data.error_code === 'ERR_11009') {
              shouldReconnectRef.current = false;
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.close();
              }
            }
          }
        } catch (error) {
          console.error('[Dashboard Chat WS] Parse error:', error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        if (shouldReconnectRef.current && reconnectAttemptsRef.current < maxReconnectAttempts && isAuthenticated) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {

            connect();
          }, reconnectDelay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      setIsConnected(false);
    }
  }, [enabled, isAuthenticated, token, getWebSocketUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Connect on mount and when auth changes
  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }
    if (isIvfUser()) {
      disconnect();
      return;
    }

    if (isAuthenticated && token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, isAuthenticated, token, connect, disconnect, isIvfUser]);

  // Request unread messages periodically (fallback)
  useEffect(() => {
    if (!enabled || !isConnected || !wsRef.current) return;

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'get_unread_messages'
        }));
      }
    }, 30000); // Every 30 seconds as fallback

    return () => clearInterval(interval);
  }, [enabled, isConnected]);

  return {
    unreadCount,
    unreadMessages,
    isConnected,
    refresh: () => {
      if (!enabled) {
        return;
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'get_unread_messages'
        }));
      }
    }
  };
}

/**
 * WebSocket hook for Track/Patient page - tracks patient-specific messages and unread count
 */
export function usePatientChatWebSocket(patientId: string | undefined) {
  const { token, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<PatientMessagesResponse['messages']>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  // Check if user is IVF department - skip WebSocket connection for IVF users
  const isIvfUser = useCallback(() => {
    try {
      const dept = localStorage.getItem('department');
      return dept && dept.toUpperCase() === 'IVF';
    } catch {
      return false;
    }
  }, []);

  const getWebSocketUrl = useCallback(() => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/chat/ws`;
  }, []);

  const connect = useCallback(() => {
    // Skip connection for IVF users - they use canisters, not patients
    if (isIvfUser()) {
      return;
    }
    
    if (!isAuthenticated || !token || !patientId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = getWebSocketUrl();
      const url = `${wsUrl}?token=${encodeURIComponent(token)}&patient_id=${encodeURIComponent(patientId)}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
      
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Subscribe to patient
        ws.send(JSON.stringify({
          type: 'subscribe_patient',
          patient_id: patientId
        }));

        // Get patient messages (doesn't mark as read)
        ws.send(JSON.stringify({
          type: 'get_patient_messages',
          patient_id: patientId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle connection confirmation
          if (data.type === 'connection_confirmed') {
            if (data.patient_messages) {
              setMessages(data.patient_messages.messages || []);
              setUnreadCount(data.patient_messages.unread_count || 0);
            }
            return;
          }

          // Handle patient messages response
          if (data.type === 'patient_messages' && data.success && data.data) {
            setMessages(data.data.messages || []);
            setUnreadCount(data.data.unread_count || 0);
            return;
          }

          // Handle new message broadcast
          if (data.type === 'new_message' && data.data) {
            const newMsg = data.data;
            if (newMsg.patient_id === patientId) {
              setMessages(prev => {
                // Check if message already exists
                const exists = prev.some(m => m.id === newMsg.id);
                if (exists) return prev;
                return [...prev, newMsg];
              });
              // Refresh messages to get updated unread count
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'get_patient_messages',
                  patient_id: patientId
                }));
              }
            }
            return;
          }

          // Handle unread messages update
          if (data.type === 'unread_messages' && data.success && data.data) {
            // Update unread count for this patient
            const patientUnread = data.data.unread_by_patient?.[patientId] || 0;
            setUnreadCount(patientUnread);
            return;
          }

          // Handle error
          if (data.type === 'error') {
            console.error('[Patient Chat WS] Error:', data.message);
          }
        } catch (error) {
          console.error('[Patient Chat WS] Parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[Patient Chat WS] Error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
    
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts && isAuthenticated && patientId) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[Patient Chat WS] Connection error:', error);
      setIsConnected(false);
    }
  }, [isAuthenticated, token, patientId, getWebSocketUrl, isIvfUser]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const markAsRead = useCallback(() => {
    if (!patientId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'mark_read',
      patient_id: patientId,
      chat_read_status: true
    }));
  }, [patientId]);

  const refreshMessages = useCallback(() => {
    if (!patientId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'get_patient_messages',
      patient_id: patientId
    }));
  }, [patientId]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    // Skip connection for IVF users - they use canisters, not patients
    if (isIvfUser()) {
      disconnect(); // Ensure any existing connection is closed
      return;
    }
    
    if (isAuthenticated && token && patientId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, token, patientId, connect, disconnect, isIvfUser]);

  return {
    messages,
    unreadCount,
    isConnected,
    markAsRead,
    refreshMessages
  };
}

/**
 * WebSocket hook for IVF/Canister page - tracks canister-specific messages and unread count
 */
export function useCanisterChatWebSocket(canisterNumber: string | undefined) {
  const { token, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<PatientMessagesResponse['messages']>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const getWebSocketUrl = useCallback(() => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/chat/ws`;
  }, []);

  const connect = useCallback(() => {
    if (!isAuthenticated || !token || !canisterNumber) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = getWebSocketUrl();
      const url = `${wsUrl}?token=${encodeURIComponent(token)}&tank_id=${encodeURIComponent(canisterNumber)}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Subscribe to canister (if backend supports it)
        // For now, we'll fetch messages via HTTP and listen for broadcasts
        // The backend will broadcast to all connected users for the canister
        
        // Fetch canister messages via HTTP (WebSocket doesn't have canister subscription yet)
        chatService.getCanisterMessages(canisterNumber).then((response) => {
          setMessages(response.messages || []);
          setUnreadCount(response.unread_count || 0);
        }).catch((error) => {
          console.error('[Canister Chat WS] Error fetching messages:', error);
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle connection confirmation
          if (data.type === 'connection_confirmed') {
            // Fetch canister messages on connection
            chatService.getCanisterMessages(canisterNumber).then((response) => {
              setMessages(response.messages || []);
              setUnreadCount(response.unread_count || 0);
            }).catch((error) => {
              console.error('[Canister Chat WS] Error fetching messages:', error);
            });
            return;
          }

          // Handle new message broadcast
          if (data.type === 'new_message' && data.data) {
            const newMsg = data.data;
            // Check if message is for this canister
            if (newMsg.canister_number === canisterNumber) {
              setMessages(prev => {
                // Check if message already exists
                const exists = prev.some(m => m.id === newMsg.id);
                if (exists) return prev;
                return [...prev, newMsg];
              });
              // Refresh messages to get updated unread count
              chatService.getCanisterMessages(canisterNumber).then((response) => {
                setMessages(response.messages || []);
                setUnreadCount(response.unread_count || 0);
              }).catch((error) => {
                console.error('[Canister Chat WS] Error refreshing messages:', error);
              });
            }
            return;
          }

          // Handle unread messages update
          if (data.type === 'unread_messages' && data.success && data.data) {
            // Update unread count for this canister
            const canisterUnread = data.data.unread_by_canister?.[canisterNumber] || 0;
            setUnreadCount(canisterUnread);
            return;
          }

          // Handle error
          if (data.type === 'error') {
            console.error('[Canister Chat WS] Error:', data.message);
          }
        } catch (error) {
          console.error('[Canister Chat WS] Parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[Canister Chat WS] Error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts && isAuthenticated && canisterNumber) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[Canister Chat WS] Connection error:', error);
      setIsConnected(false);
    }
  }, [isAuthenticated, token, canisterNumber, getWebSocketUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const markAsRead = useCallback(() => {
    if (!canisterNumber) return;
    
    // Use HTTP API to mark as read (WebSocket doesn't support canister mark_read yet)
    chatService.markCanisterAsRead(canisterNumber).catch((error) => {
      console.error('[Canister Chat WS] Error marking as read:', error);
    });
  }, [canisterNumber]);

  const refreshMessages = useCallback(() => {
    if (!canisterNumber) return;
    
    // Use HTTP API to refresh messages
    chatService.getCanisterMessages(canisterNumber).then((response) => {
      setMessages(response.messages || []);
      setUnreadCount(response.unread_count || 0);
    }).catch((error) => {
      console.error('[Canister Chat WS] Error refreshing messages:', error);
    });
  }, [canisterNumber]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (isAuthenticated && token && canisterNumber) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, token, canisterNumber, connect, disconnect]);

  return {
    messages,
    unreadCount,
    isConnected,
    markAsRead,
    refreshMessages
  };
}

