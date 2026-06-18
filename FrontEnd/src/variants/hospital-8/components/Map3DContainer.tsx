import React, { useState, useEffect, useRef } from 'react';
import { ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import { Building } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BranchMetrics, Route } from '../types/map';

interface Map3DContainerProps {
  branches: BranchMetrics[];
  routes: Route[];
  hoveredBranch: number | null;
  onBranchHover: (branchId: number | null) => void;
  onBranchClick: (branch: BranchMetrics) => void;
}

const INITIAL_VIEW_STATE = {
  longitude: 78.9629,
  latitude: 20.5937,
  zoom: 4.5,
  pitch: 30,
  bearing: 0,
};

const COLORS = {
  purple: { rgb: [147, 112, 219], hex: 'rgb(147, 112, 219)' },
  blue: [59, 130, 246],
  red: [220, 38, 38],
  lightBlue: [191, 219, 254],
  gray: [120, 130, 145],
  white: [1, 1, 1, 1],
};

const HEX_RADIUS = 0.015;
const HEX_ANGLES = [0, 60, 120, 180, 240, 300];

const GEOJSON_URLS = {
  india: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
  states: 'https://raw.githubusercontent.com/geohacker/india/master/state/india_telengana.geojson',
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
  @keyframes pulse-glow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  .animate-spin-slow-1 { animation: spin-slow 120s linear infinite; }
  .animate-spin-slow-2 { animation: spin-slow-reverse 100s linear infinite; }
  .animate-spin-slow-3 { animation: spin-slow 80s linear infinite; }
  .pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }
`;

const Map3DContainer: React.FC<Map3DContainerProps> = ({
  branches,
  routes,
  hoveredBranch,
  onBranchHover,
  onBranchClick,
}) => {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [indiaGeoJson, setIndiaGeoJson] = useState<any>(null);
  const [indiaStatesGeoJson, setIndiaStatesGeoJson] = useState<any>(null);
  const [renderKey, setRenderKey] = useState(0);
  const deckRef = useRef<DeckGL>(null);

  const getScreenCoordinates = (lng: number, lat: number): { x: number; y: number } | null => {
    if (!deckRef.current?.deck) return null;
    try {
      const viewport = deckRef.current.deck.getViewports()[0];
      if (!viewport) return null;
      const [x, y] = viewport.project([lng, lat]);
      if (typeof x === 'number' && typeof y === 'number') {
        return { x, y };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // Fetch GeoJSON data
  useEffect(() => {
    const fetchGeoJson = async (url: string, setter: (data: any) => void, isCountry = false) => {
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (isCountry) {
          const india = data.features.find((f: any) => f.properties.name === 'India');
          if (india) setter(india);
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

  // Trigger initial render after deck mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setRenderKey(k => k + 1);
    }, 500);
    return () => clearTimeout(timer);
  }, []);


  // Generate honeycomb cluster for each branch
  const generateHoneycombCluster = (branch: BranchMetrics) => {
    const hexagons: (BranchMetrics & { originalBranchId: number })[] = [
      { ...branch, originalBranchId: branch.branch_id },
    ];

    HEX_ANGLES.forEach((angle) => {
      const rad = (angle * Math.PI) / 180;
      hexagons.push({
        ...branch,
        originalBranchId: branch.branch_id,
        longitude: branch.longitude + Math.cos(rad) * HEX_RADIUS,
        latitude: branch.latitude + Math.sin(rad) * HEX_RADIUS,
      });
    });

    return hexagons;
  };

  const honeycombData = branches.flatMap((b) => generateHoneycombCluster(b));

  // Create scatter layer
  const scatterLayer = new ScatterplotLayer({
    id: 'branch-layer',
    data: honeycombData,
    pickable: true,
    radiusScale: 30,
    radiusMinPixels: 6,
    radiusMaxPixels: 20,
    lineWidthMinPixels: 0,
    getPosition: (d: any) => [d.longitude, d.latitude],
    getRadius: () => 12,
    getLineColor: COLORS.white,
    getFillColor: (d: any) => {
      if (hoveredBranch === d.originalBranchId) return COLORS.blue;
      if (d.active_alerts > 0) return COLORS.red;
      return COLORS.blue;
    },
    getLineWidth: 0,
  });

  // Create GeoJSON layers
  const geoJsonLayer = indiaGeoJson
    ? new GeoJsonLayer({
        id: 'india-boundary-layer',
        data: indiaGeoJson,
        filled: true,
        stroked: false,
        pointType: 'circle',
        getFillColor: [230, 213, 240],
        pickable: false,
      })
    : null;

  const statesLayer = indiaStatesGeoJson
    ? new GeoJsonLayer({
        id: 'india-states-layer',
        data: indiaStatesGeoJson,
        filled: false,
        pointType: 'circle',
        getLineColor: [255, 255, 255],
        getLineWidth: 2000,
        lineWidthMinPixels: 0.5,
        lineWidthMaxPixels: 1,
        pickable: false,
      })
    : null;

  const layers = [
    ...(geoJsonLayer ? [geoJsonLayer] : []),
    ...(statesLayer ? [statesLayer] : []),
    scatterLayer,
  ];

  return (
    <div className="w-full h-full relative bg-purple-50">
      <style>{SPIN_ANIMATIONS}</style>

      {/* Branch Information Cards - Over Canvas */}
      <div key={renderKey} className="absolute inset-0 z-20 pointer-events-none">
        {branches.map((branch) => {
          const coords = getScreenCoordinates(branch.longitude, branch.latitude);
          if (!coords) return null;
          return (
            <div
              key={branch.branch_id}
              className="absolute"
              style={{
                left: `${coords.x}px` as React.CSSProperties['left'],
                top: `${coords.y}px` as React.CSSProperties['top'],
                transform: 'translate(-50%, -50%)' as React.CSSProperties['transform'],
              }}
            >
              <div className="bg-white rounded-lg shadow-md p-2 w-auto whitespace-nowrap">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-md bg-yellow-50 flex items-center justify-center shrink-0">
                    <Building size={14} className="text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{branch.branch_name}</p>
                    <p className="text-xs font-bold text-gray-900 mt-0.5">
                      {branch.refrigerator_count} <span className="text-gray-500 font-normal">Refrigerators</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sci-Fi HUD Radar Overlay */}
      <div className="absolute inset-0 z-5 flex items-center justify-center pointer-events-none">
        <svg
          width="100%"
          height="100%"
          viewBox="-500 -500 1000 1000"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <defs>
            <filter id="hud-glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer ring - thick segmented arcs */}
          <g className="animate-spin-slow-1">
            {[0, 90, 180, 270].map((start) => (
              <path
                key={`outer-arc-${start}`}
                d={`M ${400 * Math.cos((start * Math.PI) / 180)} ${400 * Math.sin((start * Math.PI) / 180)} A 400 400 0 0 1 ${400 * Math.cos(((start + 60) * Math.PI) / 180)} ${400 * Math.sin(((start + 60) * Math.PI) / 180)}`}
                stroke="rgba(200, 200, 255, 0.9)"
                strokeWidth="12"
                fill="none"
                filter="url(#hud-glow)"
                className="pulse-glow"
              />
            ))}
          </g>

          {/* Second ring - dashed circle with tick marks */}
          <g className="animate-spin-slow-2">
            <circle cx="0" cy="0" r="300" stroke="rgba(200, 200, 255, 0.5)" strokeWidth="2" fill="none" strokeDasharray="10,8" />
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 360) / 24;
              const rad = (angle * Math.PI) / 180;
              const x1 = 300 * Math.cos(rad);
              const y1 = 300 * Math.sin(rad);
              const x2 = 320 * Math.cos(rad);
              const y2 = 320 * Math.sin(rad);
              return (
                <line
                  key={`tick-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(200, 200, 255, 0.6)"
                  strokeWidth="1"
                />
              );
            })}
          </g>

          {/* Third ring - medium segmented arcs */}
          <g className="animate-spin-slow-3">
            {[0, 120, 240].map((start) => (
              <path
                key={`mid-arc-${start}`}
                d={`M ${200 * Math.cos((start * Math.PI) / 180)} ${200 * Math.sin((start * Math.PI) / 180)} A 200 200 0 0 1 ${200 * Math.cos(((start + 50) * Math.PI) / 180)} ${200 * Math.sin(((start + 50) * Math.PI) / 180)}`}
                stroke="rgba(200, 200, 255, 0.7)"
                strokeWidth="6"
                fill="none"
              />
            ))}
          </g>

          {/* Inner ring - solid circle */}
          <circle cx="0" cy="0" r="100" stroke="rgba(200, 200, 255, 0.5)" strokeWidth="1.5" fill="none" />

          {/* Cardinal direction markers */}
          {['N', 'E', 'S', 'W'].map((dir, i) => {
            const angles = [0, 90, 180, 270];
            const rad = (angles[i] * Math.PI) / 180;
            const x = 130 * Math.cos(rad);
            const y = 130 * Math.sin(rad);
            return (
              <text
                key={`cardinal-${dir}`}
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(200, 200, 255, 0.7)"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {dir}
              </text>
            );
          })}

          {/* Center crosshair */}
          <g filter="url(#hud-glow)">
            <circle cx="0" cy="0" r="8" stroke="rgba(200, 200, 255, 0.9)" strokeWidth="1.5" fill="none" />
            <line x1="-15" y1="0" x2="-8" y2="0" stroke="rgba(200, 200, 255, 0.9)" strokeWidth="1.5" />
            <line x1="8" y1="0" x2="15" y2="0" stroke="rgba(200, 200, 255, 0.9)" strokeWidth="1.5" />
            <line x1="0" y1="-15" x2="0" y2="-8" stroke="rgba(200, 200, 255, 0.9)" strokeWidth="1.5" />
            <line x1="0" y1="8" x2="0" y2="15" stroke="rgba(200, 200, 255, 0.9)" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="2" fill="rgba(200, 200, 255, 0.9)" />
          </g>
        </svg>
      </div>

      {/* DeckGL Map */}
      <DeckGL
        ref={deckRef}
        initialViewState={viewState}
        controller
        layers={layers}
        onViewStateChange={(e: any) => {
          setViewState(e.viewState);
          setRenderKey(k => k + 1);
        }}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 10,
        }}
      />


      {/* Empty State */}
      {branches.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-white/80 backdrop-blur-sm rounded-lg p-4">
            <p className="text-gray-600 text-sm font-semibold">No branch data</p>
            <p className="text-gray-400 text-xs mt-2">Using mock data fallback...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Map3DContainer;
