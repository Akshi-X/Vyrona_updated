import React, { createContext, useContext, type ReactNode } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = createContext<GoogleMapsContextType | undefined>(undefined);

interface GoogleMapsProviderProps {
  children: ReactNode;
}

const MAP_LIBRARIES: ("geometry" | "maps" | "marker")[] = ["geometry", "maps", "marker"];

/**
 * Provider that initializes Google Maps loader once at the app level.
 * This ensures all components share the same loader instance and prevents conflicts.
 */
export const GoogleMapsProvider: React.FC<GoogleMapsProviderProps> = ({ children }) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'VITE_GOOGLE_MAPS_API_KEY is not defined in environment variables. ' +
      'Please ensure the .env file exists in the FrontEnd directory and restart the dev server.'
    );
  }

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: MAP_LIBRARIES,
    preventGoogleFontsLoading: true
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
};

/**
 * Hook to access the Google Maps loader state from the context.
 * Use this instead of useJsApiLoader in components.
 */
export const useGoogleMaps = (): GoogleMapsContextType => {
  const context = useContext(GoogleMapsContext);
  if (context === undefined) {
    throw new Error('useGoogleMaps must be used within a GoogleMapsProvider');
  }
  return context;
};

