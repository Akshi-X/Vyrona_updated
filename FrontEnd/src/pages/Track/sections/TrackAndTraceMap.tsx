import { useState, useEffect, useRef } from "react";
import { GoogleMap, useJsApiLoader, OverlayView } from "@react-google-maps/api";
import { trackingService, type TrackingPosition, type TrackingUpdate, type LocationInfo } from "../../../services/trackingService";
import { useParams } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";

const TrackAndTraceMap = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const { token } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [positions, setPositions] = useState<TrackingPosition[]>([]);
  const [currentPosition, setCurrentPosition] = useState<TrackingPosition | null>(null);
  const [sourcePosition, setSourcePosition] = useState<TrackingPosition | null>(null);
  const [destinationPosition, setDestinationPosition] = useState<TrackingPosition | null>(null);
  const [sourceAddress, setSourceAddress] = useState<LocationInfo | null>(null);
  const [destinationAddress, setDestinationAddress] = useState<LocationInfo | null>(null);
  const [useWebSocket, setUseWebSocket] = useState(false);
  const [shouldLoadTrackingData, setShouldLoadTrackingData] = useState<boolean>(false);
  const [activeRouteTooltip, setActiveRouteTooltip] = useState<boolean>(false);
  const [routeTooltipPosition, setRouteTooltipPosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [activeCurrentTooltip, setActiveCurrentTooltip] = useState<boolean>(false);
  const [currentTooltipPosition, setCurrentTooltipPosition] = useState<google.maps.LatLngLiteral | null>(null);
  type MapType = google.maps.MapTypeId | "roadmap" | "satellite";
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const sourceMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);
  const completedPathPolylineRef = useRef<google.maps.Polyline | null>(null);
  const remainingPathPolylineRef = useRef<google.maps.Polyline | null>(null);

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

  // Automatically connect to WebSocket when tracking data should be loaded
  useEffect(() => {
    if (shouldLoadTrackingData && patientId && !useWebSocket) {
      setUseWebSocket(true);
      setIsTracking(true);
    }
  }, [shouldLoadTrackingData, patientId, useWebSocket]);

  // Initialize Google Map when the GoogleMap component loads
  const handleMapLoad = (map: google.maps.Map) => {
    if (!window.google) return;

    googleMapRef.current = map;
    map.setMapTypeId(mapType);

    // Determine center and zoom based on available data
    let centerPosition: TrackingPosition | null = null;
    
    if (positions.length > 0) {
      centerPosition = positions[0];
    } else if (sourcePosition) {
      centerPosition = sourcePosition;
    }

    if (centerPosition) {
      map.setCenter(centerPosition);
      map.setZoom(14);
    } else {
      // Default center if no positions available
      map.setCenter({ lat: 0, lng: 0 });
      map.setZoom(2);
    }

    // Source marker (blue)
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
        title: "", // No native tooltip
      });
    }

    // Destination marker (gray)
    if (destinationPosition) {
      destinationMarkerRef.current = new window.google.maps.Marker({
        position: destinationPosition,
        map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#9ca3af",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        title: "", // No native tooltip
      });
    }

    // Marker for current vehicle position (green) - will be created when WebSocket data arrives
    // Completed path polyline (blue) - from source to current position
    completedPathPolylineRef.current = new window.google.maps.Polyline({
      map,
      strokeColor: "#3b82f6", // Blue
      strokeOpacity: 0.8,
      strokeWeight: 4,
      path: [],
    });
    
    // Remaining path polyline (gray) - from current position to destination
    remainingPathPolylineRef.current = new window.google.maps.Polyline({
      map,
      strokeColor: "#9ca3af", // Gray
      strokeOpacity: 0.8,
      strokeWeight: 4,
      path: [],
    });

    setMapLoaded(true);
  };

  // Helper function to format location name (locality, country)
  const formatLocationName = (address: LocationInfo | null): string => {
    if (!address) return "Unknown Location";
    
    const parts: string[] = [];
    
    if (address.address) {
      if (address.address.locality) {
        parts.push(address.address.locality);
      }
      if (address.address.country) {
        parts.push(address.address.country);
      }
    }
    
    // Fallback to formatted_address if available
    if (parts.length === 0 && address.formatted_address) {
      // Try to extract city and country from formatted address
      const addr = address.formatted_address;
      // Simple extraction - take first part as city, last part as country
      const addrParts = addr.split(',');
      if (addrParts.length >= 2) {
        parts.push(addrParts[0].trim());
        parts.push(addrParts[addrParts.length - 1].trim());
      } else {
        return addr;
      }
    }
    
    return parts.length > 0 ? parts.join(", ") : "Unknown Location";
  };

  // Removed InfoWindow content functions - using OverlayView tooltip instead

  // Fit map bounds to show all markers
  const fitMapBounds = () => {
    if (!googleMapRef.current || !window.google) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasBounds = false;

    // Add source position
    if (sourcePosition) {
      bounds.extend(new window.google.maps.LatLng(sourcePosition.lat, sourcePosition.lng));
      hasBounds = true;
    }

    // Add destination position
    if (destinationPosition) {
      bounds.extend(new window.google.maps.LatLng(destinationPosition.lat, destinationPosition.lng));
      hasBounds = true;
    }

    // Add all current positions
    positions.forEach(pos => {
      bounds.extend(new window.google.maps.LatLng(pos.lat, pos.lng));
      hasBounds = true;
    });

    // Fit bounds if we have at least one position
    if (hasBounds) {
      googleMapRef.current.fitBounds(bounds);
      // Add padding to bounds
      const padding = 50;
      googleMapRef.current.fitBounds(bounds, padding);
    }
  };

  // Removed currentIndex logic - using currentPosition from WebSocket instead

  // Removed InfoWindow update effect - using OverlayView tooltip instead

  // Update map markers when source/destination positions change
  useEffect(() => {
    if (!mapLoaded || !window.google || !googleMapRef.current) return;

    // Update source marker with tooltip
    if (sourcePosition) {
      const sourceLatLng = new window.google.maps.LatLng(sourcePosition.lat, sourcePosition.lng);
      if (sourceMarkerRef.current) {
        sourceMarkerRef.current.setPosition(sourceLatLng);
        sourceMarkerRef.current.setTitle(""); // Clear title to remove native tooltip
      } else {
        sourceMarkerRef.current = new window.google.maps.Marker({
          position: sourceLatLng,
          map: googleMapRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#3b82f6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
          title: "", // No native tooltip
        });
      }

      // Always update hover listeners when marker exists and addresses are available
      if (sourceMarkerRef.current && sourceAddress && destinationAddress) {
        // Clear existing listeners to avoid duplicates
        window.google.maps.event.clearListeners(sourceMarkerRef.current, "mouseover");
        window.google.maps.event.clearListeners(sourceMarkerRef.current, "mouseout");

        // Add mouseover listener to show route tooltip
        sourceMarkerRef.current.addListener("mouseover", () => {
          setRouteTooltipPosition({
            lat: sourcePosition.lat,
            lng: sourcePosition.lng,
          });
          setActiveRouteTooltip(true);
        });

        // Add mouseout listener to close route tooltip
        sourceMarkerRef.current.addListener("mouseout", () => {
          setActiveRouteTooltip(false);
        });
      }
    }

    // Update destination marker with tooltip
    if (destinationPosition) {
      const destLatLng = new window.google.maps.LatLng(destinationPosition.lat, destinationPosition.lng);
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setPosition(destLatLng);
        destinationMarkerRef.current.setTitle(""); // Clear title to remove native tooltip
      } else {
        destinationMarkerRef.current = new window.google.maps.Marker({
          position: destLatLng,
          map: googleMapRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#9ca3af",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
          title: "", // No native tooltip
        });
      }

      // Always update hover listeners when marker exists and addresses are available
      if (destinationMarkerRef.current && sourceAddress && destinationAddress) {
        // Clear existing listeners to avoid duplicates
        window.google.maps.event.clearListeners(destinationMarkerRef.current, "mouseover");
        window.google.maps.event.clearListeners(destinationMarkerRef.current, "mouseout");

        // Add mouseover listener to show route tooltip
        destinationMarkerRef.current.addListener("mouseover", () => {
          setRouteTooltipPosition({
            lat: destinationPosition.lat,
            lng: destinationPosition.lng,
          });
          setActiveRouteTooltip(true);
        });

        // Add mouseout listener to close route tooltip
        destinationMarkerRef.current.addListener("mouseout", () => {
          setActiveRouteTooltip(false);
        });
      }
    }

    // Update path polylines based on current position
    if (positions.length > 0 && currentPosition) {
      // Find the index of current position in the positions array
      const currentIndex = positions.findIndex(
        p => Math.abs(p.lat - currentPosition.lat) < 0.0001 && 
             Math.abs(p.lng - currentPosition.lng) < 0.0001
      );
      
      if (currentIndex >= 0) {
        // Completed path: source to current position (blue)
        const completedPath = positions.slice(0, currentIndex + 1).map(
          p => new window.google.maps.LatLng(p.lat, p.lng)
        );
        if (completedPathPolylineRef.current) {
          completedPathPolylineRef.current.setPath(completedPath);
        }
        
        // Remaining path: current position to destination (gray)
        const remainingPath = positions.slice(currentIndex).map(
          p => new window.google.maps.LatLng(p.lat, p.lng)
        );
        if (remainingPathPolylineRef.current) {
          remainingPathPolylineRef.current.setPath(remainingPath);
        }
      } else {
        // If current position not found in array, show all as completed (blue)
        const allPath = positions.map(p => new window.google.maps.LatLng(p.lat, p.lng));
        if (completedPathPolylineRef.current) {
          completedPathPolylineRef.current.setPath(allPath);
        }
        if (remainingPathPolylineRef.current) {
          remainingPathPolylineRef.current.setPath([]);
        }
      }
    } else if (positions.length > 0) {
      // No current position yet, show all as remaining (gray)
      const allPath = positions.map(p => new window.google.maps.LatLng(p.lat, p.lng));
      if (remainingPathPolylineRef.current) {
        remainingPathPolylineRef.current.setPath(allPath);
      }
      if (completedPathPolylineRef.current) {
        completedPathPolylineRef.current.setPath([]);
      }
    } else if (sourcePosition && destinationPosition) {
      // Only source and destination, no accumulated positions yet - show as remaining (gray)
      const sourceDestPath = [
        new window.google.maps.LatLng(sourcePosition.lat, sourcePosition.lng),
        new window.google.maps.LatLng(destinationPosition.lat, destinationPosition.lng)
      ];
      if (remainingPathPolylineRef.current) {
        remainingPathPolylineRef.current.setPath(sourceDestPath);
      }
      if (completedPathPolylineRef.current) {
        completedPathPolylineRef.current.setPath([]);
      }
    }

    // Fit bounds when we have source and destination (initial view)
    if (sourcePosition && destinationPosition && positions.length === 0) {
      fitMapBounds();
    }
  }, [sourcePosition, destinationPosition, positions, currentPosition, mapLoaded, sourceAddress, destinationAddress]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!useWebSocket || !patientId || !isTracking) return;

    const handleUpdate = (update: TrackingUpdate) => {
      if (!window.google || !googleMapRef.current) return;

      const { position } = update;
      const newPosition = new window.google.maps.LatLng(position.lat, position.lng);

      // Get all positions from tracking service (includes source, accumulated, destination)
      const allPositions = trackingService.getAllPositions();
      const sourceDestInfo = trackingService.getSourceDestinationInfo();

      // Filter out any positions with null/invalid lat/lng
      const validPositions = allPositions.filter(
        pos => pos != null && pos.lat != null && pos.lng != null && 
        !isNaN(pos.lat) && !isNaN(pos.lng)
      );

      // Update positions state
      setPositions(validPositions);
      
      // Update source and destination if available
      if (sourceDestInfo.source) {
        setSourcePosition(sourceDestInfo.source.position);
        if (sourceDestInfo.source.address) {
          setSourceAddress(sourceDestInfo.source.address);
        }
      }
      if (sourceDestInfo.destination) {
        setDestinationPosition(sourceDestInfo.destination.position);
        if (sourceDestInfo.destination.address) {
          setDestinationAddress(sourceDestInfo.destination.address);
        }
      }

      // Update current position marker
      if (markerRef.current) {
        markerRef.current.setPosition(newPosition);
        markerRef.current.setTitle(""); // Clear title to remove native tooltip
        // Update hover listeners for current location tooltip
        window.google.maps.event.clearListeners(markerRef.current, "mouseover");
        window.google.maps.event.clearListeners(markerRef.current, "mouseout");
        
        markerRef.current.addListener("mouseover", () => {
          setCurrentTooltipPosition({
            lat: position.lat,
            lng: position.lng,
          });
          setActiveCurrentTooltip(true);
        });

        markerRef.current.addListener("mouseout", () => {
          setActiveCurrentTooltip(false);
        });
      } else if (googleMapRef.current) {
        // Create marker if it doesn't exist
        markerRef.current = new window.google.maps.Marker({
          position: newPosition,
          map: googleMapRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#4fff00",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
          title: "", // No native tooltip
        });

        // Add hover listeners for current location tooltip
        markerRef.current.addListener("mouseover", () => {
          setCurrentTooltipPosition({
            lat: position.lat,
            lng: position.lng,
          });
          setActiveCurrentTooltip(true);
        });

        markerRef.current.addListener("mouseout", () => {
          setActiveCurrentTooltip(false);
        });
      }

      // Update hover listeners when addresses are available
      if (sourceDestInfo.source && sourceDestInfo.destination) {
        // Add hover listeners to source marker
        if (sourceMarkerRef.current && sourcePosition) {
          window.google.maps.event.clearListeners(sourceMarkerRef.current, "mouseover");
          window.google.maps.event.clearListeners(sourceMarkerRef.current, "mouseout");
          
          sourceMarkerRef.current.addListener("mouseover", () => {
            setRouteTooltipPosition({
              lat: sourcePosition.lat,
              lng: sourcePosition.lng,
            });
            setActiveRouteTooltip(true);
          });

          sourceMarkerRef.current.addListener("mouseout", () => {
            setActiveRouteTooltip(false);
          });
        }

        // Add hover listeners to destination marker
        if (destinationMarkerRef.current && destinationPosition) {
          window.google.maps.event.clearListeners(destinationMarkerRef.current, "mouseover");
          window.google.maps.event.clearListeners(destinationMarkerRef.current, "mouseout");
          
          destinationMarkerRef.current.addListener("mouseover", () => {
            setRouteTooltipPosition({
              lat: destinationPosition.lat,
              lng: destinationPosition.lng,
            });
            setActiveRouteTooltip(true);
          });

          destinationMarkerRef.current.addListener("mouseout", () => {
            setActiveRouteTooltip(false);
          });
        }
      }

      // Update path polylines based on current position
      // allPositions already contains: source + accumulated positions + destination
      if (validPositions.length > 0) {
        // Find the index of current position in the allPositions array
        // Use a small tolerance for floating point comparison
        const currentIndex = validPositions.findIndex(
          p => Math.abs(p.lat - position.lat) < 0.0001 && 
               Math.abs(p.lng - position.lng) < 0.0001
        );
        
        if (currentIndex >= 0) {
          // Completed path: source to current position (blue)
          const completedPath = validPositions.slice(0, currentIndex + 1).map(
            p => new window.google.maps.LatLng(p.lat, p.lng)
          );
          if (completedPathPolylineRef.current) {
            completedPathPolylineRef.current.setPath(completedPath);
          }
          
          // Remaining path: current position to destination (gray)
          const remainingPath = validPositions.slice(currentIndex).map(
            p => new window.google.maps.LatLng(p.lat, p.lng)
          );
          if (remainingPathPolylineRef.current) {
            remainingPathPolylineRef.current.setPath(remainingPath);
          }
        } else {
          // If current position not found in array, append it and split
          // Find where to insert current position (should be before destination)
          let insertIndex = validPositions.length;
          if (destinationPosition) {
            const destIndex = validPositions.findIndex(
              p => Math.abs(p.lat - destinationPosition.lat) < 0.0001 && 
                   Math.abs(p.lng - destinationPosition.lng) < 0.0001
            );
            if (destIndex >= 0) {
              insertIndex = destIndex;
            }
          }
          
          // Build path with current position inserted
          const pathWithCurrent = [
            ...validPositions.slice(0, insertIndex),
            position,
            ...validPositions.slice(insertIndex)
          ];
          
          const currentIndexInPath = insertIndex;
          
          // Completed path: source to current position (blue)
          const completedPath = pathWithCurrent.slice(0, currentIndexInPath + 1).map(
            p => new window.google.maps.LatLng(p.lat, p.lng)
          );
          if (completedPathPolylineRef.current) {
            completedPathPolylineRef.current.setPath(completedPath);
          }
          
          // Remaining path: current position to destination (gray)
          const remainingPath = pathWithCurrent.slice(currentIndexInPath).map(
            p => new window.google.maps.LatLng(p.lat, p.lng)
          );
          if (remainingPathPolylineRef.current) {
            remainingPathPolylineRef.current.setPath(remainingPath);
          }
        }
      }

      // Update current position state
      setCurrentPosition(position);
      
      // Pan to current position
      googleMapRef.current.panTo(newPosition);
    };

    const handleError = (error: Event) => {
      console.error('WebSocket error:', error);
      // Fallback if WebSocket fails
      setUseWebSocket(false);
    };

    const handleClose = () => {
      // WebSocket closed
    };

    // Connect with token
    trackingService.connectWebSocket(patientId, handleUpdate, handleError, handleClose, token || undefined);

    return () => {
      trackingService.disconnectWebSocket();
    };
  }, [useWebSocket, patientId, isTracking, token]);

  // Removed simulation/animation logic - only using WebSocket live data

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Disconnect WebSocket if connected
      if (useWebSocket) {
        trackingService.disconnectWebSocket();
      }
    };
  }, [useWebSocket]);

  // Removed handleStart, handlePause, handleReset - controls removed by user

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
            {isLoaded && (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={
                  currentPosition 
                    ? currentPosition 
                    : sourcePosition 
                    ? sourcePosition 
                    : { lat: 0, lng: 0 }
                }
                zoom={currentPosition || sourcePosition ? 14 : 2}
                mapTypeId={mapType as google.maps.MapTypeId}
                options={{
                  mapTypeControl: false,
                  fullscreenControl: false,
                  streetViewControl: false,
                }}
                onLoad={handleMapLoad}
              >
                {/* Route Tooltip Overlay (From Source to Destination) */}
                {shouldLoadTrackingData && activeRouteTooltip && routeTooltipPosition && sourceAddress && destinationAddress && googleMapRef.current && (
                  <OverlayView
                    position={routeTooltipPosition}
                    mapPaneName={OverlayView.OVERLAY_LAYER}
                    getPixelPositionOffset={(width, height) => ({
                      x: -(width / 2),
                      y: -(height + 10),
                    })}
                  >
                    <div className="bg-[#272626] text-white px-3 py-2 rounded text-xs whitespace-nowrap pointer-events-none z-50 shadow-lg inline-block">
                      {formatLocationName(sourceAddress)} � {formatLocationName(destinationAddress)}
                    </div>
                  </OverlayView>
                )}

                {/* Current Location Tooltip Overlay */}
                {shouldLoadTrackingData && activeCurrentTooltip && currentTooltipPosition && currentPosition && googleMapRef.current && (
                  <OverlayView
                    position={currentTooltipPosition}
                    mapPaneName={OverlayView.OVERLAY_LAYER}
                    getPixelPositionOffset={(width, height) => ({
                      x: -(width / 2),
                      y: -(height + 10),
                    })}
                  >
                    <div className="bg-[#272626] text-white px-3 py-2 rounded text-xs whitespace-nowrap pointer-events-none z-50 shadow-lg inline-block">
                      Current Location
                    </div>
                  </OverlayView>
                )}
              </GoogleMap>
            )}
          </div>

          {/* Load Tracking Data Flag Button */}
          {!shouldLoadTrackingData && (
            <div className="absolute top-2 left-2 z-20">
              <button
                type="button"
                onClick={() => {
                  setShouldLoadTrackingData(true);
                }}
                className="bg-white/90 backdrop-blur-sm border border-white/80 rounded-lg px-4 py-2 shadow-lg hover:bg-white transition-colors duration-200"
              >
                <div className="text-xs font-medium text-gray-900">Load Live Tracking</div>
              </button>
            </div>
          )}

          {/* Custom Map/Satellite toggle */}
          {shouldLoadTrackingData && (
            <div className="absolute top-2 left-2 z-10">
              <div className="flex rounded-full bg-white/70 backdrop-blur-sm border border-white/80 shadow-sm overflow-hidden text-xs">
                <button
                  type="button"
                  className={`px-3 py-1.5 border-r border-white/60 ${
                    mapType === "roadmap" ? "bg-white/30 text-gray-900 font-semibold" : "text-gray-600"
                  }`}
                  onClick={() => {
                    setMapType("roadmap");
                    if (googleMapRef.current) {
                      googleMapRef.current.setMapTypeId("roadmap");
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
                    setMapType("satellite");
                    if (googleMapRef.current) {
                      googleMapRef.current.setMapTypeId("satellite");
                    }
                  }}
                >
                  Satellite
                </button>
              </div>
            </div>
          )}

          {/* Removed Current Location Info box - using hover tooltip instead */}
        </div>
      </div>
    </div>
  );
};

export default TrackAndTraceMap;


