import React from 'react';

const NoiseOverlay: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 700 700"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    className="absolute inset-0 w-full h-full pointer-events-none select-none"
    style={{ zIndex: 60, opacity: 0.88, mixBlendMode: 'soft-light' }}
  >
    <defs>
      <filter
        id="nnnoise-filter"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        filterUnits="objectBoundingBox"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="linearRGB"
      >
        <feTurbulence
          type="turbulence"
          baseFrequency="0.092"
          numOctaves="4"
          seed="15"
          stitchTiles="stitch"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          result="turbulence"
        />
        <feSpecularLighting
          surfaceScale="11"
          specularConstant="1.2"
          specularExponent="20"
          lightingColor="#815db4"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          in="turbulence"
          result="specularLighting"
        >
          <feDistantLight azimuth="3" elevation="63" />
        </feSpecularLighting>
      </filter>
    </defs>
    <rect width="700" height="700" fill="transparent" />
    <rect width="700" height="700" fill="#815db4" filter="url(#nnnoise-filter)" />
  </svg>
);

export default NoiseOverlay;
