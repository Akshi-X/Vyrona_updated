import { useState, useEffect, useRef } from "react";
import { GoogleMap, OverlayView } from "@react-google-maps/api";
import { useAuth } from '../../../contexts/AuthContext';
import { authUtils } from '../../../utils/auth';
import { useGoogleMaps } from '../../../contexts/GoogleMapsProvider';

interface GeolocationData {
  type: string;
  id: number;
  canister_id: number;
  current_latitude: number | null;
  current_longitude: number | null;
  reading_timestamp: string | null;
  created_at: string | null;
}

interface TrackingPosition {
  lat: number;
  lng: number;
  timestamp?: string;
}

interface IVFTrackAndTraceMapProps {
  canisterNumber?: string;
}

const IVFTrackAndTraceMap = ({ canisterNumber }: IVFTrackAndTraceMapProps) => {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [positions, setPositions] = useState<TrackingPosition[]>([]);
  const [currentPosition, setCurrentPosition] = useState<TrackingPosition | null>(null);
  const [sourcePosition, setSourcePosition] = useState<TrackingPosition | null>(null);
  const [destinationPosition, setDestinationPosition] = useState<TrackingPosition | null>(null);
  const [mapType, setMapType] = useState<google.maps.MapTypeId | "roadmap" | "satellite">("satellite");
  const [isConnected, setIsConnected] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const sourceMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);
  const pathPolylineRef = useRef<google.maps.Polyline | null>(null);

  const { isLoaded } = useGoogleMaps();

  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/ivf/quality/ws`;
  };

  const getManagerBranchOverride = (): string | undefined => {
    try {
      const role = (localStorage.getItem('user_role') || '').trim().toLowerCase();
      if (!role.includes('manager')) return undefined;
      const fromUrl = new URLSearchParams(window.location.search).get('branch_id_override')
        || new URLSearchParams(window.location.search).get('branch_id')
        || undefined;
      const fromSession = sessionStorage.getItem('ivf_selected_branch_id') || undefined;
      return fromUrl || fromSession || undefined;
    } catch {
      return undefined;
    }
  };

  // Connect to WebSocket and handle geolocation data
  useEffect(() => {
    isMountedRef.current = true;

    if (!canisterNumber) return;
    const authToken = token || authUtils.getToken();
    if (!authToken) return;

    try {
      const params = new URLSearchParams({ token: authToken });
      const branchOverride = getManagerBranchOverride();
      if (branchOverride) {
        params.set('branch_id_override', branchOverride);
      }
      const ws = new WebSocket(`${getWebSocketUrl()}?${params.toString()}`);

      ws.onopen = () => {
        setIsConnected(true);
        setHasReceivedData(false);
        if (canisterNumber) {
          ws.send(JSON.stringify({ tank_code: canisterNumber }));
        }
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data: any = JSON.parse(event.data);

          if (data.type === 'subscription_confirmed') {
            return;
          }

          if (data.type === 'error') {
            console.error('WebSocket error:', data.message);
            return;
          }

          // Handle geolocation history
          if (data.type === 'ivf_geolocation_history' && data.geolocations) {
            const geolocations: GeolocationData[] = data.geolocations;
            const validPositions: TrackingPosition[] = [];

            geolocations.forEach((geo) => {
              if (
                geo.current_latitude != null &&
                geo.current_longitude != null &&
                !isNaN(geo.current_latitude) &&
                !isNaN(geo.current_longitude) &&
                isFinite(geo.current_latitude) &&
                isFinite(geo.current_longitude)
              ) {
                validPositions.push({
                  lat: geo.current_latitude,
                  lng: geo.current_longitude,
                  timestamp: geo.reading_timestamp || undefined,
                });
              }
            });

            if (validPositions.length > 0) {
              setHasReceivedData(true);
              setPositions(validPositions);
              setCurrentPosition(validPositions[validPositions.length - 1]);
              
              // Set source as first position
              if (validPositions.length > 0) {
                setSourcePosition(validPositions[0]);
              }
              
              // Set destination as last position (if different from source)
              if (validPositions.length > 1) {
                setDestinationPosition(validPositions[validPositions.length - 1]);
              }
            }
            return; // Don't process further if this is history data
          }

          // Handle real-time geolocation updates (if sent in quality data)
          // Check if this is quality data with geolocation (has tank_code or canister_number and coordinates)
          const hasTankCode = data.tank_code || data.canister_number || data.canister_id;
          const hasCoordinates = data.latitude != null && data.longitude != null &&
              !isNaN(data.latitude) && !isNaN(data.longitude) &&
              isFinite(data.latitude) && isFinite(data.longitude);
          
          if (hasTankCode && hasCoordinates) {
            setHasReceivedData(true);
            const newPosition: TrackingPosition = {
              lat: data.latitude,
              lng: data.longitude,
              timestamp: data.timestamp,
            };

            // Set source position from ship_from if available
            if (data.ship_from && 
                data.ship_from.latitude != null && 
                data.ship_from.longitude != null &&
                !isNaN(data.ship_from.latitude) && 
                !isNaN(data.ship_from.longitude)) {
              setSourcePosition({
                lat: data.ship_from.latitude,
                lng: data.ship_from.longitude,
              });
            }

            // Set destination position from ship_to if available
            if (data.ship_to && 
                data.ship_to.latitude != null && 
                data.ship_to.longitude != null &&
                !isNaN(data.ship_to.latitude) && 
                !isNaN(data.ship_to.longitude)) {
              setDestinationPosition({
                lat: data.ship_to.latitude,
                lng: data.ship_to.longitude,
              });
            }

            setCurrentPosition(newPosition);
            setPositions((prev) => {
              // Avoid duplicates by checking if the last position is different
              const lastPos = prev.length > 0 ? prev[prev.length - 1] : null;
              if (lastPos && 
                  Math.abs(lastPos.lat - newPosition.lat) < 0.0001 && 
                  Math.abs(lastPos.lng - newPosition.lng) < 0.0001) {
                return prev; // Skip duplicate position
              }
              const updated = [...prev, newPosition];
              return updated;
            });
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };
      ws.onclose = () => {
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (e) {
      // ignore connection errors here
    }

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'component unmount');
        } catch {}
        wsRef.current = null;
      }
    };
  }, [canisterNumber, token]);

  // Initialize map markers and polylines
  useEffect(() => {
    if (!mapLoaded || !googleMapRef.current || !window.google) return;

    const map = googleMapRef.current;

    // Clear existing markers and polylines
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (sourceMarkerRef.current) {
      sourceMarkerRef.current.setMap(null);
      sourceMarkerRef.current = null;
    }
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.setMap(null);
      destinationMarkerRef.current = null;
    }
    if (pathPolylineRef.current) {
      pathPolylineRef.current.setMap(null);
      pathPolylineRef.current = null;
    }

    // Create source marker (blue)
    if (sourcePosition) {
      sourceMarkerRef.current = new window.google.maps.Marker({
        position: sourcePosition,
        map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        title: "Source",
      });
    }

    // Create destination marker (red)
    if (destinationPosition && 
        (destinationPosition.lat !== sourcePosition?.lat || 
         destinationPosition.lng !== sourcePosition?.lng)) {
      destinationMarkerRef.current = new window.google.maps.Marker({
        position: destinationPosition,
        map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        title: "Destination",
      });
    }

    // Create current position marker (green with arrow)
    if (currentPosition) {
      markerRef.current = new window.google.maps.Marker({
        position: currentPosition,
        map,
        icon: {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          rotation: 0,
        },
        title: "Current Position",
      });
    }

    // Create path polyline
    if (positions.length > 1) {
      pathPolylineRef.current = new window.google.maps.Polyline({
        path: positions.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: "#3b82f6",
        strokeOpacity: 1.0,
        strokeWeight: 3,
        map,
      });
    }

    // Fit map bounds to show all positions
    if (positions.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      positions.forEach((pos) => {
        bounds.extend(pos);
      });
      if (sourcePosition) bounds.extend(sourcePosition);
      if (destinationPosition) bounds.extend(destinationPosition);
      if (currentPosition) bounds.extend(currentPosition);
      
      map.fitBounds(bounds);
      
      // Ensure minimum zoom level
      const listener = window.google.maps.event.addListener(map, 'bounds_changed', () => {
        if (map.getZoom() && map.getZoom()! > 18) {
          map.setZoom(18);
        }
        window.google.maps.event.removeListener(listener);
      });
    } else if (currentPosition) {
      map.setCenter(currentPosition);
      map.setZoom(14);
    }
  }, [mapLoaded, positions, currentPosition, sourcePosition, destinationPosition]);

  const handleMapLoad = (map: google.maps.Map) => {
    if (!window.google) return;
    googleMapRef.current = map;
    map.setMapTypeId(mapType);
    setMapLoaded(true);
  };

  const handleMapUnmount = () => {
    googleMapRef.current = null;
    setMapLoaded(false);
  };

  const toggleMapType = () => {
    if (!googleMapRef.current || !window.google) return;
    const newType = mapType === "satellite" ? "roadmap" : "satellite";
    setMapType(newType);
    googleMapRef.current.setMapTypeId(newType);
  };

  if (!isLoaded) {
    return (
      <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[460px] flex items-center justify-center">
        <div className="text-gray-500">Loading map...</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[460px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-black text-[16px]">Track and Trace</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMapType}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-medium text-gray-700 transition-colors"
            title="Toggle map type"
          >
            {mapType === "satellite" ? "Roadmap" : "Satellite"}
          </button>
        </div>
      </div>

      <div className="flex-1 relative rounded-lg overflow-hidden" data-map-container>
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={currentPosition || { lat: 0, lng: 0 }}
          zoom={currentPosition ? 14 : 2}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          }}
          onLoad={handleMapLoad}
          onUnmount={handleMapUnmount}
        >
          {currentPosition && (
            <OverlayView
              position={currentPosition}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div className="bg-white px-2 py-1 rounded shadow-md text-xs font-medium text-gray-700">
                Current Location
              </div>
            </OverlayView>
          )}
        </GoogleMap>
      </div>

      {positions.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75 rounded-lg">
          <div className="text-gray-500 text-sm">
            {!isConnected || wsRef.current?.readyState !== WebSocket.OPEN ? (
              'Connecting...'
            ) : isConnected && wsRef.current?.readyState === WebSocket.OPEN && !hasReceivedData ? (
              'No data available'
            ) : (
              'Waiting for location data...'
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default IVFTrackAndTraceMap;

