import { useState, useEffect, useRef } from "react";
import { MapPin, Pause, Play } from "lucide-react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { trackingService, type TrackingPosition, type TrackingUpdate } from "../../../services/trackingService";
import { useParams } from "react-router-dom";

const TrackAndTraceMap = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [positions, setPositions] = useState<TrackingPosition[]>([]);
  const [useWebSocket, setUseWebSocket] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [mapType, setMapType] = useState<google.maps.MapTypeId>(google.maps.MapTypeId.ROADMAP);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const pathPolylineRef = useRef<google.maps.Polyline | null>(null);
  const simulationCleanupRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'VITE_GOOGLE_MAPS_API_KEY is not defined in environment variables. ' +
      'Please ensure the .env file exists in the FrontEnd directory and restart the dev server.'
    );
  }

  // Use the same loader configuration as ControlTowerMap to avoid conflicts
  // Include both 'maps' and 'geometry' libraries to support all features
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: ['geometry', 'maps'],
    preventGoogleFontsLoading: true
  });

  // Load tracking data on mount
  useEffect(() => {
    const loadTrackingData = async () => {
      try {
        // Try to get live data from API, fallback to mock data
        const data = await trackingService.getLiveTrackingData(patientId || '');
        if (data && data.length > 0) {
          setPositions(data);
        } else {
          // Fallback to mock data
          const mockData = trackingService.getMockTrackingData();
          setPositions(mockData);
        }
      } catch (error) {
        console.error('Error loading tracking data:', error);
        // Fallback to mock data
        const mockData = trackingService.getMockTrackingData();
        setPositions(mockData);
      }
    };

    loadTrackingData();
  }, [patientId]);

  // Initialize Google Map when the GoogleMap component loads
  const handleMapLoad = (map: google.maps.Map) => {
    if (!window.google || positions.length === 0) return;

    googleMapRef.current = map;

    // Center the map on the first position
    map.setCenter(positions[0]);
    map.setZoom(14);
    map.setMapTypeId(mapType);

    // Marker for vehicle
    markerRef.current = new window.google.maps.Marker({
      position: positions[0],
      map,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#4fff00",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
    });

    // Polyline path
    pathPolylineRef.current = new window.google.maps.Polyline({
      map,
      strokeColor: "#4fff00",
      strokeOpacity: 0.8,
      strokeWeight: 4,
      path: [positions[0]],
    });

    setMapLoaded(true);
  };

  // Handle WebSocket updates
  useEffect(() => {
    if (!useWebSocket || !patientId || !isTracking) return;

    const handleUpdate = (update: TrackingUpdate) => {
      if (!markerRef.current || !pathPolylineRef.current || !googleMapRef.current || !window.google) return;

      const { position } = update;
      const newPosition = new window.google.maps.LatLng(position.lat, position.lng);

      markerRef.current.setPosition(newPosition);
      pathPolylineRef.current.getPath().push(newPosition);
      googleMapRef.current.panTo(newPosition);
      setCurrentIndex(update.index);
    };

    const handleError = (error: Event) => {
      console.error('WebSocket error:', error);
      setIsWebSocketConnected(false);
      // Fallback to simulation if WebSocket fails
      setUseWebSocket(false);
    };

    const handleClose = () => {
      setIsWebSocketConnected(false);
    };

    trackingService.connectWebSocket(patientId, handleUpdate, handleError, handleClose);
    setIsWebSocketConnected(true);

    return () => {
      trackingService.disconnectWebSocket();
      setIsWebSocketConnected(false);
    };
  }, [useWebSocket, patientId, isTracking]);

  // Smooth animation logic for simulated tracking
  useEffect(() => {
    if (!isTracking || !mapLoaded || positions.length === 0 || useWebSocket) return;
    if (currentIndex >= positions.length - 1) return;

    const start = new window.google.maps.LatLng(positions[currentIndex]);
    const end = new window.google.maps.LatLng(positions[currentIndex + 1]);
    const totalFrames = 100; // smoother movement (more = slower)
    let frame = 0;

    const animate = () => {
      if (!isTracking || !markerRef.current || !pathPolylineRef.current || !googleMapRef.current || useWebSocket) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }
      frame++;

      const progress = frame / totalFrames;
      const interpolated = window.google.maps.geometry.spherical.interpolate(
        start,
        end,
        progress
      );

      markerRef.current.setPosition(interpolated);
      pathPolylineRef.current.getPath().push(interpolated);
      googleMapRef.current.panTo(interpolated);

      if (frame < totalFrames) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [currentIndex, isTracking, mapLoaded, positions, useWebSocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Disconnect WebSocket if connected
      if (useWebSocket) {
        trackingService.disconnectWebSocket();
      }
      // Cancel animation frame if running
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Clean up simulation if running
      if (simulationCleanupRef.current) {
        simulationCleanupRef.current();
        simulationCleanupRef.current = null;
      }
    };
  }, [useWebSocket]);

  const handleStart = () => {
    // Check if WebSocket should be used (you can add a toggle or check env var)
    const enableWebSocket = (import.meta as any).env?.VITE_ENABLE_TRACKING_WEBSOCKET === 'true';

    if (enableWebSocket && patientId) {
      setUseWebSocket(true);
    } else {
      setUseWebSocket(false);
      // Reset to start if at end
      if (currentIndex >= positions.length - 1) {
        setCurrentIndex(0);
        if (markerRef.current && pathPolylineRef.current && googleMapRef.current && positions[0]) {
          markerRef.current.setPosition(positions[0]);
          pathPolylineRef.current.setPath([positions[0]]);
          googleMapRef.current.panTo(positions[0]);
        }
      }
    }
    setIsTracking(true);
  };

  const handlePause = () => {
    setIsTracking(false);
    if (useWebSocket) {
      trackingService.disconnectWebSocket();
      setIsWebSocketConnected(false);
    }
    if (simulationCleanupRef.current) {
      simulationCleanupRef.current();
      simulationCleanupRef.current = null;
    }
  };

  const handleReset = () => {
    setIsTracking(false);
    setCurrentIndex(0);
    setUseWebSocket(false);

    if (useWebSocket) {
      trackingService.disconnectWebSocket();
      setIsWebSocketConnected(false);
    }

    if (simulationCleanupRef.current) {
      simulationCleanupRef.current();
      simulationCleanupRef.current = null;
    }

    if (markerRef.current && pathPolylineRef.current && googleMapRef.current && positions.length > 0) {
      markerRef.current.setPosition(positions[0]);
      pathPolylineRef.current.setPath([positions[0]]);
      googleMapRef.current.panTo(positions[0]);
    }
  };

  if (!isLoaded) {
    return (
      <div className="w-full h-[290px] rounded overflow-hidden border border-[#E7E1E1] flex items-center justify-center">
        <span className="text-gray-400">Loading map...</span>
      </div>
    );
  }

  return (
    <div className="rounded-[5px] border border-gray-200 bg-white p-4 h-[460px]">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 text-[16px]">Track and Trace</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-600 font-semibold">On time</span>
              <span className="text-gray-400">
                ETA 12:37pm
              </span>
          </div>
        </div>
        <div className="w-full rounded overflow-hidden border border-[#E7E1E1] relative">
          {/* Map */}
          <div className="w-full h-[360px]">
            {isLoaded && positions.length > 0 && (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={positions[0]}
                zoom={14}
                mapTypeId={mapType}
                options={{
                  mapTypeControl: false,
                  fullscreenControl: false,
                  streetViewControl: false,
                }}
                onLoad={handleMapLoad}
              />
            )}
          </div>

          {/* Custom Map/Satellite toggle */}
          <div className="absolute top-2 left-2 z-10">
            <div className="flex rounded-full bg-white/70 backdrop-blur-sm border border-white/80 shadow-sm overflow-hidden text-xs">
              <button
                type="button"
                className={`px-3 py-1.5 border-r border-white/60 ${
                  mapType === "roadmap" ? "bg-white/30 text-gray-900 font-semibold" : "text-gray-600"
                }`}
                onClick={() => {
                  setMapType(google.maps.MapTypeId.ROADMAP);
                  if (googleMapRef.current) {
                    googleMapRef.current.setMapTypeId(google.maps.MapTypeId.ROADMAP);
                  }
                }}
              >
                Map
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 ${
                  mapType === "satellite" ? "bg-white/30 text-gray-900 font-semibold" : "text-gray-600"
                }`}
                onClick={() => {
                  setMapType(google.maps.MapTypeId.SATELLITE);
                  if (googleMapRef.current) {
                    googleMapRef.current.setMapTypeId(google.maps.MapTypeId.SATELLITE);
                  }
                }}
              >
                Satellite
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="absolute top-2 right-2 bg-white rounded-lg shadow-lg p-2 flex items-center gap-2 z-10">
            <div className="text-xs text-gray-600 px-2">
              Position: <span className="font-semibold">{currentIndex + 1}</span> / {positions.length || 0}
            </div>

            <div className="flex gap-1">
              {!isTracking ? (
                <button
                  onClick={handleStart}
                  disabled={!mapLoaded}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded text-white text-sm font-medium ${mapLoaded ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 cursor-not-allowed"
                    }`}
                >
                  <Play size={16} />
                  Start
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
                >
                  <Pause size={16} />
                  Pause
                </button>
              )}

              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Current Location Info */}
          {positions[currentIndex] && (
            <div className="absolute bottom-2 left-2 bg-white/40 backdrop-blur-sm border border-white/80 rounded-lg shadow-lg p-3 max-w-[280px] z-10">
              <div className="flex items-center gap-2 mb-2">
                <MapPin color="#4fff00" size={18} />
                <h3 className="font-semibold text-gray-800 text-sm m-0">Current Location</h3>
              </div>
              <div className="text-xs text-black-600 space-y-1">
                <div>
                  Latitude: <span className="font-mono">{positions[currentIndex].lat.toFixed(6)}</span>
                </div>
                <div>
                  Longitude: <span className="font-mono">{positions[currentIndex].lng.toFixed(6)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Status Indicator */}
          <div className="absolute bottom-2 right-2 bg-white rounded-lg shadow-lg px-3 py-2 z-10">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${isTracking ? "bg-green-500 animate-pulse" : "bg-gray-400"
                  }`}
              />
              <span className="text-xs font-medium text-gray-700">
                {isTracking
                  ? (useWebSocket && isWebSocketConnected
                    ? "Live Tracking (WebSocket)"
                    : "Tracking Active")
                  : "Tracking Paused"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackAndTraceMap;


