import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core';
import DeckGL from '@deck.gl/react';
import { AlertTriangle } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import BranchPopupCard from './BranchPopupCard';
import type { BranchMetrics, Route } from '../types/map';

export interface Map3DContainerHandle {
  flyToInitial: () => void;
}

interface Map3DContainerProps {
  branches: BranchMetrics[];
  routes?: Route[];
  hoveredBranch: number | null;
  onBranchHover?: (branchId: number | null) => void;
  onBranchClick?: (branch: BranchMetrics) => void;
  selectedBranch?: BranchMetrics | null;
  onClosePopup?: () => void;
  pitch?: number;
  /** Fires once the India + states GeoJSON have loaded and the map is drawable */
  onMapReady?: () => void;
}

const INITIAL_VIEW_STATE = {
  longitude: 78.9629,
  latitude: 20.5937,
  zoom: 4.0,
  pitch: 20,
  bearing: 0,
};

const GEOJSON_URLS = {
  india: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
  states: 'https://raw.githubusercontent.com/geohacker/india/master/state/india_telengana.geojson',
};

const MAP_OFFSET = '-4%';
const MAP_OFFSET_RATIO = -0.04;

// State center + zoom to show the full state in viewport.
// Centers are biased toward the state's major population clusters so the branch
// marker stays in view after the FlyTo even with the map's 20° pitch.
const STATE_VIEW: Record<string, { lat: number; lng: number; zoom: number }> = {
  // Karnataka: major city Bangalore is at 12.97°N — shift center south
  'karnataka':          { lat: 14.0,    lng: 76.8,    zoom: 6.5 },
  // Tamil Nadu: spans 8°–13°N — center lower to keep Chennai visible
  'tamil nadu':         { lat: 11.5,    lng: 78.6,    zoom: 6.5 },
  // Andhra Pradesh: major centres in south (Tirupati) and north (Vizag)
  'andhra pradesh':     { lat: 15.5,    lng: 79.5,    zoom: 6.5 },
  'telangana':          { lat: 17.8,    lng: 79.0,    zoom: 7.0 },
  'kerala':             { lat: 10.5,    lng: 76.3,    zoom: 7.0 },
  'maharashtra':        { lat: 19.2,    lng: 75.7,    zoom: 6.0 },
  'gujarat':            { lat: 22.3,    lng: 71.2,    zoom: 6.5 },
  'rajasthan':          { lat: 26.5,    lng: 74.0,    zoom: 5.8 },
  'madhya pradesh':     { lat: 23.0,    lng: 78.7,    zoom: 6.0 },
  'uttar pradesh':      { lat: 26.8,    lng: 80.9,    zoom: 6.0 },
  'delhi':              { lat: 28.7041, lng: 77.1025, zoom: 10.0 },
  'west bengal':        { lat: 22.8,    lng: 87.9,    zoom: 6.5 },
  'odisha':             { lat: 20.5,    lng: 85.1,    zoom: 6.5 },
  'bihar':              { lat: 25.1,    lng: 85.3,    zoom: 7.0 },
  'jharkhand':          { lat: 23.6,    lng: 85.3,    zoom: 7.0 },
  'chhattisgarh':       { lat: 21.3,    lng: 81.9,    zoom: 6.5 },
  'punjab':             { lat: 31.1,    lng: 75.3,    zoom: 7.5 },
  'haryana':            { lat: 29.1,    lng: 76.1,    zoom: 7.5 },
  'himachal pradesh':   { lat: 31.1,    lng: 77.2,    zoom: 7.5 },
  'uttarakhand':        { lat: 30.1,    lng: 79.0,    zoom: 7.5 },
  'assam':              { lat: 26.2,    lng: 92.9,    zoom: 7.0 },
  'meghalaya':          { lat: 25.5,    lng: 91.4,    zoom: 8.0 },
  'manipur':            { lat: 24.7,    lng: 93.9,    zoom: 8.0 },
  'nagaland':           { lat: 26.2,    lng: 94.6,    zoom: 8.0 },
  'tripura':            { lat: 23.9,    lng: 91.9,    zoom: 8.5 },
  'mizoram':            { lat: 23.2,    lng: 92.9,    zoom: 8.5 },
  'sikkim':             { lat: 27.5,    lng: 88.5,    zoom: 9.5 },
  'arunachal pradesh':  { lat: 28.2,    lng: 94.7,    zoom: 6.5 },
  'goa':                { lat: 15.3,    lng: 74.1,    zoom: 9.5 },
  'jammu and kashmir':  { lat: 33.8,    lng: 76.6,    zoom: 6.5 },
  'ladakh':             { lat: 34.2,    lng: 77.6,    zoom: 6.5 },
};

// Deterministic "random" purple shade per state for the choropleth look
const STATE_PURPLES: [number, number, number][] = [
  [208, 182, 236],
  [190, 156, 224],
  [172, 132, 212],
  [154, 112, 196],
  [136, 94, 180],
  [118, 76, 162],
  [101, 60, 144],
  [84, 44, 126],
  [150, 76, 160],
  [124, 60, 142],
];

const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const statePurple = (
  name: string,
  alpha: number,
): [number, number, number, number] => {
  const c = STATE_PURPLES[hashString(name) % STATE_PURPLES.length];
  return [c[0], c[1], c[2], alpha];
};

const SPIN_ANIMATIONS = `
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes spin-slow-reverse {
    from { transform: rotate(0deg); }
    to { transform: rotate(-360deg); }
  }
  @keyframes radar-ring-pulse {
    0%, 100% { transform: scale(0.96); opacity: 0.85; }
    50%      { transform: scale(1.08); opacity: 1; }
  }
  @keyframes radar-ring-pulse-rev {
    0%, 100% { transform: scale(1.06); opacity: 1; }
    50%      { transform: scale(0.92); opacity: 0.78; }
  }
  @keyframes marker-pop {
    0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
    80%  { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  }
  .animate-spin-slow-1 { animation: spin-slow 120s linear infinite; }
  .animate-spin-slow-2 { animation: spin-slow-reverse 100s linear infinite; }
`;

const Map3DContainer = forwardRef<Map3DContainerHandle, Map3DContainerProps>(({
  branches,
  hoveredBranch,
  onBranchClick,
  selectedBranch,
  onClosePopup,
  pitch,
  onMapReady,
}, ref) => {
  const [viewState, setViewState] = useState<any>({
    ...INITIAL_VIEW_STATE,
    ...(typeof pitch === 'number' ? { pitch } : {}),
  });

  useEffect(() => {
    if (typeof pitch !== 'number') return;
    setViewState((v: any) => ({ ...v, pitch }));
  }, [pitch]);

  const [indiaGeoJson, setIndiaGeoJson] = useState<any>(null);
  const [worldGeoJson, setWorldGeoJson] = useState<any>(null);
  const [indiaStatesGeoJson, setIndiaStatesGeoJson] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    flyToInitial: () => {
      setViewState({
        ...INITIAL_VIEW_STATE,
        transitionDuration: 1200,
        transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }),
      });
    },
  }));

  // Projects [lng, lat] to canvas-relative coords (for overlay positioning)
  // and to viewport-fixed coords (for SVG line).
  const project = (lng: number, lat: number) => {
    const el = containerRef.current;
    if (!el) return null;
    try {
      const rect = el.getBoundingClientRect();
      const { width, height } = rect;
      if (!width || !height) return null;
      const vp = new WebMercatorViewport({
        width,
        height,
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        pitch: viewState.pitch ?? 0,
        bearing: viewState.bearing ?? 0,
      });
      const [cx, cy] = vp.project([lng, lat]);
      if (typeof cx !== 'number' || typeof cy !== 'number') return null;
      // Canvas has left: MAP_OFFSET_RATIO offset, overlay shares the same origin
      const offsetX = MAP_OFFSET_RATIO * width;
      return {
        canvasX: cx,
        canvasY: cy,
        viewportX: rect.left + offsetX + cx,
        viewportY: rect.top + cy,
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const fetchGeoJson = async (url: string, setter: (data: any) => void, isCountry = false) => {
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (isCountry) {
          const india = data.features.find((f: any) => f.properties.name === 'India');
          if (india) setter(india);
          // Keep every other country for the greyed-out backdrop
          setWorldGeoJson({
            type: 'FeatureCollection',
            features: data.features.filter((f: any) => f.properties.name !== 'India'),
          });
        } else {
          setter(data);
        }
      } catch (err) {
        console.error(`Failed to fetch GeoJSON from ${url}:`, err);
      }
    };
    fetchGeoJson(GEOJSON_URLS.india, setIndiaGeoJson, true);
    fetchGeoJson(GEOJSON_URLS.states, setIndiaStatesGeoJson);
  }, []);

  const mapLoaded = !!(indiaGeoJson && indiaStatesGeoJson);

  // Signal the parent once both GeoJSON layers are loaded, leaving deck.gl a
  // beat to paint the first frame before the intro reveal begins.
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const mapReadyFired = useRef(false);
  useEffect(() => {
    if (mapReadyFired.current || !mapLoaded) return;
    mapReadyFired.current = true;
    const t = setTimeout(() => onMapReadyRef.current?.(), 100);
    return () => clearTimeout(t);
  }, [mapLoaded]);

  const flyToBranch = (branch: BranchMetrics) => {
    const stateKey = (branch.state_name ?? '').toLowerCase().trim();
    const sv = STATE_VIEW[stateKey];
    setViewState((v: any) => ({
      ...v,
      latitude: sv?.lat ?? branch.latitude,
      longitude: sv?.lng ?? branch.longitude,
      zoom: sv?.zoom ?? 7,
      transitionDuration: 1400,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    }));
  };

  const handleMarkerClick = (e: React.MouseEvent, branch: BranchMetrics) => {
    e.stopPropagation();
    flyToBranch(branch);
    onBranchClick?.(branch);
  };

  const handleClosePopup = () => {
    // Fly back to overview then notify parent
    setViewState({
      ...INITIAL_VIEW_STATE,
      transitionDuration: 1200,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }),
    });
    onClosePopup?.();
  };

  // Live viewport position of the selected branch marker (updates on every animation frame)
  const selectedMarkerViewportPos = selectedBranch
    ? project(selectedBranch.longitude, selectedBranch.latitude)
    : null;

  const selectedStateKey = selectedBranch
    ? (selectedBranch.state_name ?? '').toLowerCase().trim()
    : null;

  // Try multiple property keys used by different GeoJSON sources
  const getFeatureStateName = (feature: any): string => {
    const p = feature.properties ?? {};
    return (p.NAME_1 ?? p.ST_NM ?? p.name ?? p.NAME ?? p.State ?? p.state ?? '')
      .toLowerCase()
      .trim();
  };

  const visibleBranches = selectedStateKey
    ? branches.filter(b => (b.state_name ?? '').toLowerCase().trim() === selectedStateKey)
    : branches;

  const scatterLayer = new ScatterplotLayer({
    id: 'branch-layer',
    data: visibleBranches,
    pickable: true,
    radiusMinPixels: 5,
    radiusMaxPixels: 12,
    getPosition: (d: any) => [d.longitude, d.latitude],
    getRadius: () => 8,
    getFillColor: ((d: any) => {
      if (hoveredBranch === d.branch_id) return [255, 255, 255, 220];
      if (d.refrigerator_count === 0) return [160, 140, 190, 180];
      if (d.active_alerts > 0) return [251, 113, 133, 230];
      return [139, 92, 246, 230];
    }) as any,
    getLineColor: [255, 255, 255, 120] as any,
    lineWidthMinPixels: 1,
    stroked: true,
  });

  // Greyed-out backdrop of every other country (overview only)
  const worldLayer = worldGeoJson && !selectedStateKey
    ? new GeoJsonLayer({
        id: 'world-countries-layer',
        data: worldGeoJson,
        filled: true,
        stroked: true,
        pointType: 'circle',
        getFillColor: [180, 180, 180, 100],
        getLineColor: [80, 80, 80, 190],
        getLineWidth: 2000,
        lineWidthMinPixels: 0.5,
        lineWidthMaxPixels: 1,
        pickable: false,
      })
    : null;

  // Hide the full-India fill when a state is selected — only the selected state polygon should be visible
  const geoJsonLayer = indiaGeoJson && !selectedStateKey
    ? new GeoJsonLayer({
        id: 'india-boundary-layer',
        data: indiaGeoJson,
        filled: true,
        stroked: true,
        pointType: 'circle',
        getFillColor: [150, 112, 192],
        getLineColor: [235, 210, 255],
        getLineWidth: 4000,
        lineWidthMinPixels: 1.5,
        lineWidthMaxPixels: 3,
        pickable: false,
      })
    : null;

  const statesLayer = indiaStatesGeoJson
    ? new GeoJsonLayer({
        id: 'india-states-layer',
        data: indiaStatesGeoJson,
        filled: true,
        stroked: true,
        pointType: 'circle',
        getFillColor: (feature: any) => {
          const name = getFeatureStateName(feature);
          if (selectedStateKey) {
            return name === selectedStateKey ? statePurple(name, 240) : [0, 0, 0, 0];
          }
          return statePurple(name, 235);
        },
        getLineColor: (feature: any) => {
          if (!selectedStateKey) return [215, 185, 255, 180];
          return getFeatureStateName(feature) === selectedStateKey
            ? [215, 185, 255, 220]
            : [0, 0, 0, 0];
        },
        getLineWidth: 2000,
        lineWidthMinPixels: 0.8,
        lineWidthMaxPixels: 1.5,
        pickable: false,
        updateTriggers: {
          getFillColor: [selectedStateKey],
          getLineColor: [selectedStateKey],
        },
      })
    : null;

  const layers = [
    ...(worldLayer ? [worldLayer] : []),
    ...(geoJsonLayer ? [geoJsonLayer] : []),
    ...(statesLayer ? [statesLayer] : []),
    ...(mapLoaded ? [scatterLayer] : []),
  ];

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <style>{SPIN_ANIMATIONS}</style>

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            'radial-gradient(ellipse 76% 80% at 50% 48%, transparent 42%, rgba(74,18,116,0.14) 74%, rgba(52,12,86,0.32) 100%)',
        }}
      />

      {/* HUD Radar — hidden when zoomed into a state (India fill removed → radar bleeds through) */}
      <div
        className="hidden absolute inset-0 z-[5] flex items-center justify-center pointer-events-none"
        style={{ left: MAP_OFFSET, opacity: selectedStateKey ? 0 : 1, transition: 'opacity 0.6s ease' }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="-400 -400 800 800"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <defs>
            <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(180, 90, 220, 0.20)" />
              <stop offset="45%" stopColor="rgba(139, 42, 150, 0.08)" />
              <stop offset="100%" stopColor="rgba(139, 42, 150, 0)" />
            </radialGradient>
          </defs>

          <g className="animate-spin-slow-1">
            {[0, 180].map((start) => (
              <path
                key={`outer-arc-${start}`}
                d={`M ${400 * Math.cos((start * Math.PI) / 180)} ${400 * Math.sin((start * Math.PI) / 180)} A 400 400 0 0 1 ${400 * Math.cos(((start + 100) * Math.PI) / 180)} ${400 * Math.sin(((start + 100) * Math.PI) / 180)}`}
                stroke="rgba(180, 120, 230, 0.10)"
                strokeWidth="20"
                fill="none"
              />
            ))}
          </g>

          <circle cx="0" cy="0" r="350" fill="url(#radarGlow)" />

          <g className="animate-spin-slow-2">
            {Array.from({ length: 60 }).map((_, i) => {
              const angle = (i * 360) / 60;
              const rad = (angle * Math.PI) / 180;
              return (
                <line
                  key={`tick-${i}`}
                  x1={290 * Math.cos(rad)}
                  y1={290 * Math.sin(rad)}
                  x2={310 * Math.cos(rad)}
                  y2={310 * Math.sin(rad)}
                  stroke="rgba(130, 170, 255, 0.22)"
                  strokeWidth="1"
                />
              );
            })}
          </g>

          <circle cx="0" cy="0" r="280" stroke="rgba(180, 120, 230, 0.16)" strokeWidth="1" fill="none" />

          <g style={{ animation: 'radar-ring-pulse 4.5s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }}>
            <circle cx="0" cy="0" r="240" stroke="rgba(160, 115, 235, 0.30)" strokeWidth="1.5" fill="none" />
            <circle cx="0" cy="0" r="200" stroke="rgba(130, 170, 255, 0.45)" strokeWidth="2" fill="none" />
          </g>
          <g style={{ animation: 'radar-ring-pulse-rev 6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }}>
            <circle cx="0" cy="0" r="150" stroke="rgba(130, 170, 255, 0.55)" strokeWidth="3" fill="none" />
            <circle cx="0" cy="0" r="100" stroke="rgba(150, 120, 235, 0.62)" strokeWidth="3.5" fill="none" />
          </g>
        </svg>
      </div>

      {/* DeckGL Map */}
      <DeckGL
        viewState={viewState}
        controller={{ scrollZoom: true, dragPan: true, dragRotate: true, doubleClickZoom: true, touchZoom: true, touchRotate: true, keyboard: false }}
        layers={layers}
        onViewStateChange={(e: any) => {
          setViewState(e.viewState);
        }}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: '0',
          left: MAP_OFFSET,
          zIndex: 10,
        } as any}
      />

      {/* Glass sheen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 11,
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 26%, transparent 48%)',
        }}
      />

      {/* Left-side vignette — darkens the canvas behind the floating cards */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 12,
          background:
            'linear-gradient(to right, rgba(250,250,250,0.62) 0%, rgba(250,250,250,0.38) 16%, rgba(250,250,250,0.14) 30%, transparent 46%)',
        }}
      />

      {/* Branch markers — overlay in canvas coordinate space.
          Hidden until the base map is drawn so pins never float on an empty canvas. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 20, left: MAP_OFFSET }}
      >
        {mapLoaded && visibleBranches.map((branch) => {
          const coords = project(branch.longitude, branch.latitude);
          if (!coords) return null;
          const hasRefrig = branch.refrigerator_count > 0;
          const hasAlert = branch.active_alerts > 0;
          const isSelected = selectedBranch?.branch_id === branch.branch_id;

          return (
            <div
              key={branch.branch_id}
              className="absolute"
              style={{
                left: coords.canvasX,
                top: coords.canvasY,
                transform: 'translate(-50%, -50%)',
                animation: 'marker-pop 0.35s ease-out both',
                pointerEvents: hasRefrig ? 'auto' : 'none',
                cursor: hasRefrig ? 'pointer' : 'default',
                opacity: selectedBranch && !isSelected ? 0.45 : 1,
                transition: 'opacity 0.25s',
              }}
              onClick={(e) => {
                if (!hasRefrig) return;
                handleMarkerClick(e, branch);
              }}
            >
              {hasRefrig ? (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full whitespace-nowrap shadow-lg"
                  style={{
                    background: hasAlert
                      ? 'linear-gradient(135deg, rgba(220,38,38,0.88) 0%, rgba(153,27,27,0.92) 100%)'
                      : 'linear-gradient(135deg, rgba(107,17,118,0.88) 0%, rgba(55,10,95,0.92) 100%)',
                    backdropFilter: 'blur(12px)',
                    border: isSelected
                      ? '1px solid rgba(255,255,255,0.7)'
                      : hasAlert
                        ? '1px solid rgba(248,113,113,0.45)'
                        : '1px solid rgba(192,132,252,0.40)',
                    boxShadow: isSelected ? '0 0 0 3px rgba(192,132,252,0.35)' : undefined,
                  }}
                >
                  {hasAlert && <AlertTriangle size={8} className="text-red-300 shrink-0" />}
                  {!hasAlert && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#c084fc' }} />
                  )}
                  <span className="text-[10px] font-bold text-white leading-none">{branch.branch_name}</span>
                  <span
                    className="text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.85)' }}
                  >
                    {branch.refrigerator_count}
                  </span>
                </div>
              ) : (
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: 'rgba(160,140,190,0.75)',
                    border: '1px solid rgba(255,255,255,0.35)',
                    backdropFilter: 'blur(4px)',
                  }}
                  title={branch.branch_name}
                />
              )}
            </div>
          );
        })}
      </div>

      {branches.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-white/80 backdrop-blur-sm rounded-lg p-4">
            <p className="text-gray-600 text-sm font-semibold">No branch data</p>
          </div>
        </div>
      )}

      {/* Popup card — rendered via portal with live marker viewport position */}
      {selectedBranch && selectedMarkerViewportPos && (
        <BranchPopupCard
          branch={selectedBranch}
          markerPos={{ x: selectedMarkerViewportPos.viewportX, y: selectedMarkerViewportPos.viewportY }}
          onClose={handleClosePopup}
        />
      )}
    </div>
  );
});

Map3DContainer.displayName = 'Map3DContainer';

export default Map3DContainer;
