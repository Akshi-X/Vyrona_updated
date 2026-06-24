import React from 'react';
import { createPortal } from 'react-dom';
import { X, Bell, MapPin, Thermometer, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { BranchMetrics } from '../types/map';

interface BranchPopupCardProps {
  branch: BranchMetrics;
  /** Viewport-fixed position of the branch marker on screen */
  markerPos: { x: number; y: number };
  onClose: () => void;
}

const CARD_W = 228;
const CARD_H = 272;
// Vertical gap between card bottom edge and marker centre
const CARD_OFFSET = 18;

const BranchPopupCard: React.FC<BranchPopupCardProps> = ({ branch, markerPos, onClose }) => {
  const isHealthy = branch.active_alerts === 0;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Centred above the marker; clamp to viewport edges
  const cardLeft = Math.max(8, Math.min(vw - CARD_W - 8, Math.round(markerPos.x - CARD_W / 2)));
  const cardTop  = Math.max(8, markerPos.y - CARD_H - CARD_OFFSET);

  // Connector: bottom-centre of card → marker
  const connX = cardLeft + CARD_W / 2;
  const connY = cardTop + CARD_H;
  const midY  = (connY + markerPos.y) / 2;
  const bezierPath = `M ${connX} ${connY} C ${connX} ${midY} ${markerPos.x} ${midY} ${markerPos.x} ${markerPos.y}`;

  const markerInView =
    markerPos.x >= 0 && markerPos.x <= vw && markerPos.y >= 0 && markerPos.y <= vh;

  return createPortal(
    <>
      {/* SVG connector line */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 9997,
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <defs>
          <linearGradient
            id="branchLineGrad"
            gradientUnits="userSpaceOnUse"
            x1={connX} y1={connY}
            x2={markerPos.x} y2={markerPos.y}
          >
            <stop offset="0%" stopColor="rgba(255,255,255,0.80)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.30)" />
          </linearGradient>
        </defs>

        <path
          d={bezierPath}
          stroke="url(#branchLineGrad)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          fill="none"
          strokeLinecap="round"
        />

        {markerInView && (
          <>
            <circle cx={markerPos.x} cy={markerPos.y} r="10" fill="rgba(255,255,255,0.12)" />
            <circle cx={markerPos.x} cy={markerPos.y} r="5"  fill="rgba(255,255,255,0.82)" />
            <circle cx={markerPos.x} cy={markerPos.y} r="2"  fill="white" />
          </>
        )}

        {/* Notch at card bottom */}
        <circle cx={connX} cy={connY} r="3.5" fill="rgba(255,255,255,0.82)" />
        <circle cx={connX} cy={connY} r="6.5" fill="rgba(255,255,255,0.18)" />
      </svg>

      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={onClose}
      />

      {/* Light card */}
      <div
        className="select-none"
        style={{
          position: 'fixed',
          left: cardLeft,
          top: cardTop,
          width: CARD_W,
          zIndex: 9999,
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.52)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.72)',
            boxShadow:
              '0 12px 40px rgba(107,17,118,0.14), 0 2px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.90)',
          }}
        >
          {/* Header — translucent light purple tint */}
          <div
            className="relative px-4 pt-4 pb-3"
            style={{
              background: 'rgba(247,236,255,0.55)',
              borderBottom: '1px solid rgba(255,255,255,0.55)',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition hover:bg-[#6b1176]/10"
              style={{
                background: 'rgba(107,17,118,0.07)',
                pointerEvents: 'auto',
                zIndex: 20,
              }}
            >
              <X size={12} className="text-[#6b1176]/70" />
            </button>

            <p className="text-[9px] font-semibold tracking-widest uppercase text-[#6b1176]/50">
              Branch Overview
            </p>
            <h3 className="text-[15px] font-black text-gray-800 mt-0.5 leading-tight pr-7">
              {branch.branch_name}
            </h3>

            <div className="flex items-end gap-2 mt-2.5">
              <span className="text-3xl font-black leading-none" style={{ color: '#6b1176' }}>
                {branch.refrigerator_count}
              </span>
              <span className="text-[10px] text-gray-400 font-semibold mb-0.5">refrigerators</span>
            </div>

            <div className="mt-1.5 w-full h-1 rounded-full bg-[#E9D5FF]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min((branch.refrigerator_count / 15) * 100, 100)}%`,
                  background: '#6b1176',
                }}
              />
            </div>
          </div>

          {/* Body */}
          <div className="px-4 pt-3 pb-4 flex flex-col gap-2.5">
            {/* Status badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: isHealthy ? 'rgba(220,252,231,0.70)' : 'rgba(254,226,226,0.70)',
                  color:      isHealthy ? '#15803d' : '#b91c1c',
                  border: `1px solid ${isHealthy ? 'rgba(134,239,172,0.60)' : 'rgba(252,165,165,0.60)'}`,
                }}
              >
                {isHealthy ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
                {isHealthy
                  ? 'Healthy'
                  : `${branch.active_alerts} Alert${branch.active_alerts > 1 ? 's' : ''}`}
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-gray-500"
                style={{ background: 'rgba(243,244,246,0.65)', border: '1px solid rgba(255,255,255,0.70)' }}
              >
                <Thermometer size={9} />
                #{branch.branch_id}
              </span>
            </div>

            {/* Stat row */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.48)', border: '1px solid rgba(255,255,255,0.68)' }}
              >
                <Bell size={11} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-[8px] text-gray-400 uppercase tracking-wider">Alerts</p>
                  <p
                    className="text-xs font-black"
                    style={{ color: branch.active_alerts > 0 ? '#dc2626' : '#16a34a' }}
                  >
                    {branch.active_alerts}
                  </p>
                </div>
              </div>
              <div
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.48)', border: '1px solid rgba(255,255,255,0.68)' }}
              >
                <MapPin size={11} className="text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[8px] text-gray-400 uppercase tracking-wider">State</p>
                  <p className="text-xs font-bold text-gray-700 truncate">
                    {branch.state_name ?? '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Coordinates */}
            <p className="text-[9px] text-center font-mono text-gray-300">
              {branch.latitude.toFixed(3)}°N &nbsp;{branch.longitude.toFixed(3)}°E
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default BranchPopupCard;
