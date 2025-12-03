import { BaseApiService } from './baseApiService';
import liveRouteMock from '../data/live_route_mock.json';

export interface TrackingPosition {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface TrackingUpdate {
  position: TrackingPosition;
  index: number;
  total: number;
}

class TrackingService extends BaseApiService {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  constructor() {
    super();
    // Get WebSocket URL from environment or construct from API base URL
    const envWsUrl = (import.meta as any).env?.VITE_WS_URL;
    const apiUrl = this.baseUrl.replace(/^http/, 'ws');
    this.wsUrl = envWsUrl || `${apiUrl}/ws/tracking`;
  }

  /**
   * Get mock tracking data from JSON file
   */
  getMockTrackingData(): TrackingPosition[] {
    return liveRouteMock as TrackingPosition[];
  }

  /**
   * Connect to WebSocket for live tracking updates
   * @param patientId - Patient ID to track
   * @param onUpdate - Callback function for position updates
   * @param onError - Callback function for errors
   * @param onClose - Callback function for connection close
   */
  connectWebSocket(
    patientId: string,
    onUpdate: (update: TrackingUpdate) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      const url = `${this.wsUrl}?patient_id=${patientId}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected for tracking:', patientId);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.lat && data.lng) {
            onUpdate({
              position: {
                lat: data.lat,
                lng: data.lng,
                timestamp: data.timestamp || new Date().toISOString(),
              },
              index: data.index || 0,
              total: data.total || 0,
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) onError(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        if (onClose) onClose();
        this.ws = null;
        
        // Attempt to reconnect if not manually closed
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.connectWebSocket(patientId, onUpdate, onError, onClose);
          }, this.reconnectDelay);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      if (onError) onError(error as Event);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.reconnectAttempts = 0;
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Simulate live tracking from mock data
   * @param positions - Array of tracking positions
   * @param onUpdate - Callback function for position updates
   * @param interval - Update interval in milliseconds (default: 100)
   */
  simulateLiveTracking(
    positions: TrackingPosition[],
    onUpdate: (update: TrackingUpdate) => void,
    interval: number = 100
  ): () => void {
    let currentIndex = 0;
    let isRunning = true;

    const updatePosition = () => {
      if (!isRunning || currentIndex >= positions.length) {
        return;
      }

      const position = positions[currentIndex];
      onUpdate({
        position,
        index: currentIndex,
        total: positions.length,
      });

      currentIndex++;
      if (currentIndex < positions.length) {
        setTimeout(updatePosition, interval);
      }
    };

    updatePosition();

    // Return cleanup function
    return () => {
      isRunning = false;
    };
  }

  /**
   * Get tracking data - mock only (no backend call)
   *
   * For now we only use local mock data and do NOT hit the backend endpoint.
   * This avoids 404s for /api/tracking/live/{patientId} until the API exists.
   */
  async getLiveTrackingData(patientId: string): Promise<TrackingPosition[]> {
    return this.getMockTrackingData();
  }
}

export const trackingService = new TrackingService();

