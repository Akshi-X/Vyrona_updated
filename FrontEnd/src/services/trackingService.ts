import { BaseApiService } from './baseApiService';
import { authUtils } from '../utils/auth';
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

export interface AddressInfo {
  street?: string;
  sublocality?: string;
  locality?: string;
  state?: string;
  country?: string;
  zip_code?: string;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  formatted_address?: string;
  address?: AddressInfo;
}

export interface QualityWebSocketData {
  patient_id: string;
  shipment_id: string;
  latitude: number;
  longitude: number;
  ship_from: LocationInfo;
  ship_to: LocationInfo;
  timestamp: string;
  [key: string]: any; // Allow other properties
}

export interface SourceDestinationInfo {
  source: {
    position: TrackingPosition;
    address?: LocationInfo;
  } | null;
  destination: {
    position: TrackingPosition;
    address?: LocationInfo;
  } | null;
}

class TrackingService extends BaseApiService {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private sourcePosition: TrackingPosition | null = null;
  private destinationPosition: TrackingPosition | null = null;
  private sourceAddress: LocationInfo | null = null;
  private destinationAddress: LocationInfo | null = null;
  private accumulatedPositions: TrackingPosition[] = [];

  constructor() {
    super();
    // Use the same WebSocket endpoint as quality tracking
    const apiUrl = this.baseUrl.replace(/^http/, 'ws');
    this.wsUrl = `${apiUrl}/api/quality/ws`;
  }

  /**
   * Get mock tracking data from JSON file
   */
  getMockTrackingData(): TrackingPosition[] {
    return liveRouteMock as TrackingPosition[];
  }

  /**
   * Connect to WebSocket for live tracking updates using quality WebSocket
   * @param patientId - Patient ID to track
   * @param onUpdate - Callback function for position updates
   * @param onError - Callback function for errors
   * @param onClose - Callback function for connection close
   * @param token - Authentication token (optional, will use authUtils if not provided)
   */
  connectWebSocket(
    patientId: string,
    onUpdate: (update: TrackingUpdate) => void,
    onError?: (error: Event) => void,
    onClose?: () => void,
    token?: string
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      // Get authentication token
      const authToken = token || authUtils.getToken();
      if (!authToken) {
        console.error('No authentication token available');
        if (onError) onError(new Event('authentication_error'));
        return;
      }

      // Reset accumulated positions when connecting
      this.accumulatedPositions = [];
      this.sourcePosition = null;
      this.destinationPosition = null;

      const url = `${this.wsUrl}?token=${encodeURIComponent(authToken)}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected for tracking:', patientId);
        this.reconnectAttempts = 0;
        
        // Send patient_id subscription message
        if (this.ws?.readyState === WebSocket.OPEN && patientId) {
          this.ws.send(JSON.stringify({ patient_id: patientId }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data: QualityWebSocketData = JSON.parse(event.data);

          // Skip subscription confirmations and errors
          if (data.type === 'subscription_confirmed' || data.type === 'error') {
            return;
          }

          // Check if this is quality data with location information
          // Validate that lat/lng are not null, undefined, or NaN
          const isValidLat = data.latitude != null && !isNaN(data.latitude) && isFinite(data.latitude);
          const isValidLng = data.longitude != null && !isNaN(data.longitude) && isFinite(data.longitude);
          
          if (isValidLat && isValidLng && data.patient_id) {
            // Store source and destination positions from first message
            if (!this.sourcePosition && data.ship_from) {
              const sourceLat = data.ship_from.latitude;
              const sourceLng = data.ship_from.longitude;
              if (sourceLat != null && sourceLng != null && 
                  !isNaN(sourceLat) && !isNaN(sourceLng) &&
                  isFinite(sourceLat) && isFinite(sourceLng)) {
                this.sourcePosition = {
                  lat: sourceLat,
                  lng: sourceLng,
                  timestamp: data.timestamp,
                };
                // Store source address information
                this.sourceAddress = {
                  latitude: sourceLat,
                  longitude: sourceLng,
                  formatted_address: data.ship_from.formatted_address,
                  address: data.ship_from.address,
                };
              }
            }

            if (!this.destinationPosition && data.ship_to) {
              const destLat = data.ship_to.latitude;
              const destLng = data.ship_to.longitude;
              if (destLat != null && destLng != null && 
                  !isNaN(destLat) && !isNaN(destLng) &&
                  isFinite(destLat) && isFinite(destLng)) {
                this.destinationPosition = {
                  lat: destLat,
                  lng: destLng,
                  timestamp: data.timestamp,
                };
                // Store destination address information
                this.destinationAddress = {
                  latitude: destLat,
                  longitude: destLng,
                  formatted_address: data.ship_to.formatted_address,
                  address: data.ship_to.address,
                };
              }
            }

            // Create current position
            const currentPosition: TrackingPosition = {
              lat: data.latitude,
              lng: data.longitude,
              timestamp: data.timestamp,
            };

            // Add to accumulated positions (avoid duplicates by checking last position)
            const lastPosition = this.accumulatedPositions[this.accumulatedPositions.length - 1];
            if (!lastPosition || 
                lastPosition.lat !== currentPosition.lat || 
                lastPosition.lng !== currentPosition.lng) {
              this.accumulatedPositions.push(currentPosition);
            }

            // Build complete positions array: source + accumulated + destination
            const allPositions: TrackingPosition[] = [];
            
            // Add source if available
            if (this.sourcePosition) {
              allPositions.push(this.sourcePosition);
            }

            // Add accumulated positions
            allPositions.push(...this.accumulatedPositions);

            // Add destination if available (only at the end)
            if (this.destinationPosition && 
                !allPositions.some(p => 
                  p.lat === this.destinationPosition!.lat && 
                  p.lng === this.destinationPosition!.lng)) {
              allPositions.push(this.destinationPosition);
            }

            // Calculate index based on accumulated positions (excluding source/destination)
            const index = this.accumulatedPositions.length - 1;
            const total = allPositions.length;

            // Notify with update
            onUpdate({
              position: currentPosition,
              index: Math.max(0, index),
              total: total,
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
            this.connectWebSocket(patientId, onUpdate, onError, onClose, token);
          }, this.reconnectDelay);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      if (onError) onError(error as Event);
    }
  }

  /**
   * Get source and destination positions
   */
  getSourceDestination(): { source: TrackingPosition | null; destination: TrackingPosition | null } {
    return {
      source: this.sourcePosition,
      destination: this.destinationPosition,
    };
  }

  /**
   * Get source and destination with address information
   */
  getSourceDestinationInfo(): SourceDestinationInfo {
    return {
      source: this.sourcePosition ? {
        position: this.sourcePosition,
        address: this.sourceAddress || undefined,
      } : null,
      destination: this.destinationPosition ? {
        position: this.destinationPosition,
        address: this.destinationAddress || undefined,
      } : null,
    };
  }

  /**
   * Get all accumulated positions including source and destination
   */
  getAllPositions(): TrackingPosition[] {
    const allPositions: TrackingPosition[] = [];
    
    if (this.sourcePosition) {
      allPositions.push(this.sourcePosition);
    }
    
    allPositions.push(...this.accumulatedPositions);
    
    if (this.destinationPosition && 
        !allPositions.some(p => 
          p.lat === this.destinationPosition!.lat && 
          p.lng === this.destinationPosition!.lng)) {
      allPositions.push(this.destinationPosition);
    }
    
    return allPositions;
  }

  /**
   * Reset accumulated positions
   */
  resetPositions(): void {
    this.accumulatedPositions = [];
    this.sourcePosition = null;
    this.destinationPosition = null;
    this.sourceAddress = null;
    this.destinationAddress = null;
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
  async getLiveTrackingData(_patientId: string): Promise<TrackingPosition[]> {
    return this.getMockTrackingData();
  }
}

export const trackingService = new TrackingService();

