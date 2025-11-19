import { useState, useEffect, useRef } from "react";
import { MapPin, Pause, Play } from "lucide-react";
import { useJsApiLoader } from "@react-google-maps/api";
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
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const pathPolylineRef = useRef<google.maps.Polyline | null>(null);
  const simulationCleanupRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAD7-vocQRsa6eAn3eieib9M8--AJaKscY';
  
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

  // Initialize Google Map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google || positions.length === 0) return;

    const initMap = () => {
      if (!window.google || !mapRef.current || positions.length === 0) return;

      const map = new window.google.maps.Map(mapRef.current, {
        zoom: 14,
        center: positions[0],
        mapTypeId: "roadmap",
      });

      googleMapRef.current = map;

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

    initMap();
  }, [isLoaded, positions]);

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
    <div className="w-full h-[460px] rounded overflow-hidden border border-[#E7E1E1] relative">
      {/* Map */}
      <div ref={mapRef} className="w-full h-full" />

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
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-white text-sm font-medium ${
                mapLoaded ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 cursor-not-allowed"
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
        <div className="absolute bottom-2 left-2 bg-white rounded-lg shadow-lg p-3 max-w-[280px] z-10">
          <div className="flex items-center gap-2 mb-2">
            <MapPin color="#4fff00" size={18} />
            <h3 className="font-semibold text-gray-800 text-sm m-0">Current Location</h3>
          </div>
          <div className="text-xs text-gray-600 space-y-1">
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
            className={`w-3 h-3 rounded-full ${
              isTracking ? "bg-green-500 animate-pulse" : "bg-gray-400"
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
  );
};

export default TrackAndTraceMap;


