import { useGoogleMaps } from '../contexts/GoogleMapsProvider';

/**
 * Shared Google Maps loader hook that ensures all components use the same loader instance.
 * This prevents conflicts when multiple map components are used in the same application.
 * 
 * @deprecated Use useGoogleMaps() directly from the context instead.
 * This hook is kept for backward compatibility.
 */
export const useGoogleMapsLoader = () => {
  return useGoogleMaps();
};

