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

export interface GeolocationData {
  type: string;
  id: number;
  shipment_id: string;
  patient_id: string;
  telemetry_data_id: number;
  current_latitude: number | null;
  current_longitude: number | null;
  shipment_from_latitude: number | null;
  shipment_from_longitude: number | null;
  shipment_to_latitude: number | null;
  shipment_to_longitude: number | null;
  reading_timestamp: string;
  created_at: string;
}

export interface GeolocationHistoryMessage {
  type: 'geolocation_history';
  patient_id: string;
  geolocations: GeolocationData[];
  count: number;
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
          const rawData: any = JSON.parse(event.data);

          // Skip subscription confirmations and errors
          if (rawData.type === 'subscription_confirmed' || rawData.type === 'error') {
            return;
          }

          // Handle geolocation_history message type
          if (rawData.type === 'geolocation_history' && rawData.geolocations && Array.isArray(rawData.geolocations)) {
            const historyData = rawData as GeolocationHistoryMessage;
            this.processGeolocationHistory(historyData, onUpdate);
            return;
          }

          // Handle regular quality data messages
          const data: QualityWebSocketData = rawData;

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

            // Add to accumulated positions (avoid duplicates by checking with tolerance)
            const isDuplicate = this.accumulatedPositions.some(
              existing => 
                Math.abs(existing.lat - currentPosition.lat) < 0.0001 && 
                Math.abs(existing.lng - currentPosition.lng) < 0.0001
            );
            if (!isDuplicate) {
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
   * Process geolocation history message
   * Extracts source, destination, and historical positions from geolocation_history message
   */
  private processGeolocationHistory(
    historyData: GeolocationHistoryMessage,
    onUpdate: (update: TrackingUpdate) => void
  ): void {
    if (!historyData.geolocations || historyData.geolocations.length === 0) {
      return;
    }

    // Find source and destination from geolocations that have shipment_from/to data
    let foundSource = false;
    let foundDestination = false;

    // Process each geolocation entry
    const historicalPositions: TrackingPosition[] = [];

    for (const geo of historyData.geolocations) {
      // Extract source position (from first entry with valid shipment_from coordinates)
      if (!foundSource && 
          geo.shipment_from_latitude != null && 
          geo.shipment_from_longitude != null &&
          !isNaN(geo.shipment_from_latitude) && 
          !isNaN(geo.shipment_from_longitude) &&
          isFinite(geo.shipment_from_latitude) && 
          isFinite(geo.shipment_from_longitude)) {
        this.sourcePosition = {
          lat: geo.shipment_from_latitude,
          lng: geo.shipment_from_longitude,
          timestamp: geo.reading_timestamp || geo.created_at,
        };
        // Note: Address info not available in geolocation_history, only coordinates
        this.sourceAddress = {
          latitude: geo.shipment_from_latitude,
          longitude: geo.shipment_from_longitude,
        };
        foundSource = true;
      }

      // Extract destination position (from first entry with valid shipment_to coordinates)
      if (!foundDestination && 
          geo.shipment_to_latitude != null && 
          geo.shipment_to_longitude != null &&
          !isNaN(geo.shipment_to_latitude) && 
          !isNaN(geo.shipment_to_longitude) &&
          isFinite(geo.shipment_to_latitude) && 
          isFinite(geo.shipment_to_longitude)) {
        this.destinationPosition = {
          lat: geo.shipment_to_latitude,
          lng: geo.shipment_to_longitude,
          timestamp: geo.reading_timestamp || geo.created_at,
        };
        // Note: Address info not available in geolocation_history, only coordinates
        this.destinationAddress = {
          latitude: geo.shipment_to_latitude,
          longitude: geo.shipment_to_longitude,
        };
        foundDestination = true;
      }

      // Extract current positions (historical tracking points)
      if (geo.current_latitude != null && 
          geo.current_longitude != null &&
          !isNaN(geo.current_latitude) && 
          !isNaN(geo.current_longitude) &&
          isFinite(geo.current_latitude) && 
          isFinite(geo.current_longitude)) {
        historicalPositions.push({
          lat: geo.current_latitude,
          lng: geo.current_longitude,
          timestamp: geo.reading_timestamp || geo.created_at,
        });
      }
    }

    // Sort historical positions by timestamp to ensure correct order
    historicalPositions.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // Update accumulated positions with historical data
    // Remove duplicates based on lat/lng (with small tolerance)
    const uniquePositions: TrackingPosition[] = [];
    for (const pos of historicalPositions) {
      const isDuplicate = uniquePositions.some(
        existing => 
          Math.abs(existing.lat - pos.lat) < 0.0001 && 
          Math.abs(existing.lng - pos.lng) < 0.0001
      );
      if (!isDuplicate) {
        uniquePositions.push(pos);
      }
    }

    this.accumulatedPositions = uniquePositions;

    // Build complete positions array: source + historical + destination
    const allPositions: TrackingPosition[] = [];
    
    // Add source if available
    if (this.sourcePosition) {
      allPositions.push(this.sourcePosition);
    }

    // Add historical positions
    allPositions.push(...this.accumulatedPositions);

    // Add destination if available (only at the end)
    if (this.destinationPosition && 
        !allPositions.some(p => 
          Math.abs(p.lat - this.destinationPosition!.lat) < 0.0001 && 
          Math.abs(p.lng - this.destinationPosition!.lng) < 0.0001)) {
      allPositions.push(this.destinationPosition);
    }

    // Determine current position (most recent historical position, or last in array)
    const currentPosition = this.accumulatedPositions.length > 0 
      ? this.accumulatedPositions[this.accumulatedPositions.length - 1]
      : (this.sourcePosition || null);

    if (currentPosition) {
      // Find index of current position in allPositions
      const currentIndex = allPositions.findIndex(
        p => Math.abs(p.lat - currentPosition.lat) < 0.0001 && 
             Math.abs(p.lng - currentPosition.lng) < 0.0001
      );

      // Notify with update
      onUpdate({
        position: currentPosition,
        index: Math.max(0, currentIndex >= 0 ? currentIndex : this.accumulatedPositions.length - 1),
        total: allPositions.length,
      });
    }
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
          Math.abs(p.lat - this.destinationPosition!.lat) < 0.0001 && 
          Math.abs(p.lng - this.destinationPosition!.lng) < 0.0001)) {
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

