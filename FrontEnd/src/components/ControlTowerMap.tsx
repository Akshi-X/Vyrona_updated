import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { shipmentService } from '../services/shipmentService';

type MapRoute = {
  shipment_id: number | string;
  patient_id: string;
  source_location: string;
  destination_location: string;
  source_latitude: number;
  source_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
};

const darkWorldStyle: google.maps.MapTypeStyle[] = [
  // Continents (land) solid black
  { elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a3a3a3' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  // Light outlines
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#272626' }, { weight: 0.5 }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#272626' }, { weight: 0.7 }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a3a3a3' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  // Oceans/sea background
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#272626' }] },
];

const ControlTowerMap: React.FC = () => {
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);

  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAD7-vocQRsa6eAn3eieib9M8--AJaKscY';

  const { isLoaded } = useJsApiLoader({ 
    id: 'google-map-script', 
    googleMapsApiKey: apiKey, 
    libraries: ['geometry', 'maps'],
    preventGoogleFontsLoading: true 
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await shipmentService.getControlTowerMapRoutes();
        if (mounted) setRoutes(data as any);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load map routes');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const mapCenter = useMemo<google.maps.LatLngLiteral>(() => ({ lat: 15, lng: 20 }), []);
  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    styles: darkWorldStyle,
    gestureHandling: 'greedy',
    minZoom: 2,
    maxZoom: 9,
    backgroundColor: '#272626',
  }), []);

  const handleLoad = useCallback((map: google.maps.Map) => {
    const g = (window as any).google;
    if (g?.maps?.ControlPosition) {
      map.setOptions({
        zoomControlOptions: { position: g.maps.ControlPosition.LEFT_CENTER },
      });
    }
    setMapRef(map);
  }, []);

  const handleUnmount = useCallback(() => {
    setMapRef(null);
  }, []);

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg relative overflow-hidden w-full h-[400px] lg:min-w-[674px] lg:h-[868px]">
      <div className="absolute inset-0 bg-[#272626]">
        <div className="w-full h-full relative">
          {/* Network Status overlay (top-right) */}
          <div className="absolute top-3 right-3 bg-white/15 backdrop-blur-sm border border-white/30 rounded-lg px-3 py-2 shadow-sm z-10">
            <div className="flex items-center justify-between gap-6">
              <div className="text-[12px] font-medium text-[#FFFFFF]">Last updated: {new Date().toLocaleTimeString()}</div>
            </div>
          </div>

          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={mapCenter}
              zoom={3}
              options={mapOptions}
              onLoad={handleLoad}
              onUnmount={handleUnmount}
            >
              {routes.map((r) => {
                const origin = { lat: r.source_latitude, lng: r.source_longitude } as google.maps.LatLngLiteral;
                const dest = { lat: r.destination_latitude, lng: r.destination_longitude } as google.maps.LatLngLiteral;
                return (
                  <React.Fragment key={`${r.shipment_id}-${r.patient_id}`}>
                    <Marker position={origin} icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#22DC0E', fillOpacity: 1, strokeColor: '#FFFFFF', strokeOpacity: 1, strokeWeight: 2 }} />
                    <Marker position={dest} icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#22DC0E', fillOpacity: 1, strokeColor: '#FFFFFF', strokeOpacity: 1, strokeWeight: 2 }} />
                    <Polyline path={[origin, dest]} options={{ strokeColor: '#22DC0E', strokeOpacity: 0.95, strokeWeight: 2 }} />
                  </React.Fragment>
                );
              })}
            </GoogleMap>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white text-xs">Loading map...</div>
          )}

          {/* Legend card */}
          <div className="absolute bottom-6 left-6 text-white z-10">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl shadow-lg px-4 py-3 w-[230px]">
              <div className="text-sm font-semibold">Logistics Network</div>
              <div className="text-[11px] text-gray-200 mt-0.5">Route Status</div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="inline-block w-4 h-1.5 rounded-full bg-[#22c55e]" />
                  <span className="text-[12px]">Safe Route (On Time)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-block w-4 h-1.5 rounded-full bg-[#eab308]" />
                  <span className="text-[12px]">Delayed Routes</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-block w-4 h-1.5 rounded-full bg-[#ef4444]" />
                  <span className="text-[12px]">High-Risk Routes</span>
                </div>
              </div>
            </div>
          </div>

          {/* Custom zoom controls - above legend */}
          <div className="absolute left-6 bottom-[190px] z-10">
            <div
              className="flex flex-col items-stretch rounded-xl border border-white/40 shadow-[0_2px_10px_rgba(0,0,0,0.45)] overflow-hidden backdrop-blur-sm w-[38px] h-[69px]"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 100%)' }}
            >
              <button
                type="button"
                aria-label="Zoom in"
                className="w-full flex-1 text-white text-[20px] leading-none flex items-center justify-center hover:bg-white/10"
                onClick={() => {
                  if (!mapRef) return;
                  const next = Math.min((mapRef.getZoom() ?? 3) + 1, 9);
                  mapRef.setZoom(next);
                }}
              >
                +
              </button>
              <div className="h-px bg-white/40 mx-2" />
              <button
                type="button"
                aria-label="Zoom out"
                className="w-full flex-1 text-white text-[20px] leading-none flex items-center justify-center hover:bg-white/10"
                onClick={() => {
                  if (!mapRef) return;
                  const next = Math.max((mapRef.getZoom() ?? 3) - 1, 2);
                  mapRef.setZoom(next);
                }}
              >
                –
              </button>
            </div>
          </div>

          {error && (
            <div className="absolute bottom-4 left-4 text-xs text-red-300 bg-black/50 px-2 py-1 rounded z-10">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ControlTowerMap;


