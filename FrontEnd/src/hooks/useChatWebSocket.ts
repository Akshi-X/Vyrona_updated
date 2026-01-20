import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { chatService, type UnreadMessagesResponse, type PatientMessagesResponse } from '../services/chatService';

/**
 * WebSocket hook for Dashboard - tracks unread tagged messages count
 * Does NOT mark messages as read
 */
export function useDashboardChatWebSocket() {
  const { token, isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessagesResponse['unread_messages']>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = import.meta.env.MAX_RECONNECT_ATTEMPTS;
  const reconnectDelay = import.meta.env.RECONNECT_DELAY;

  const getWebSocketUrl = useCallback(() => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://127.0.0.1:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/chat/ws`;
  }, []);

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = getWebSocketUrl();
      const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
       
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
          }
        } catch (error) {
          console.error('[Dashboard Chat WS] Parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[Dashboard Chat WS] Error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts && isAuthenticated) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {

            connect();
          }, reconnectDelay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[Dashboard Chat WS] Connection error:', error);
      setIsConnected(false);
    }
  }, [isAuthenticated, token, getWebSocketUrl]);

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
    if (isAuthenticated && token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, token, connect, disconnect]);

  // Request unread messages periodically (fallback)
  useEffect(() => {
    if (!isConnected || !wsRef.current) return;

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'get_unread_messages'
        }));
      }
    }, 30000); // Every 30 seconds as fallback

    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    unreadCount,
    unreadMessages,
    isConnected,
    refresh: () => {
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

  const getWebSocketUrl = useCallback(() => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://127.0.0.1:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/chat/ws`;
  }, []);

  const connect = useCallback(() => {
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
  }, [isAuthenticated, token, patientId, getWebSocketUrl]);

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
    if (isAuthenticated && token && patientId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, token, patientId, connect, disconnect]);

  return {
    messages,
    unreadCount,
    isConnected,
    markAsRead,
    refreshMessages
  };
}

