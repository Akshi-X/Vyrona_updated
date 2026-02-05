import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = createContext<GoogleMapsContextType | undefined>(undefined);

interface GoogleMapsProviderProps {
  children: ReactNode;
}

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

  // Clear any existing Google Maps script tags and loader instances before initializing
  useEffect(() => {
    // Remove ALL existing Google Maps script tags to prevent conflicts
    const existingScripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
    existingScripts.forEach((script) => {
      script.remove();
    });

    // Clear the @googlemaps/js-api-loader internal cache
    // The library stores loader instances in a Map internally
    if (typeof window !== 'undefined') {
      try {
        // Try to access and clear the Loader's internal instances cache
        // The Loader class from @googlemaps/js-api-loader maintains a static cache
        const Loader = (window as any).google?.maps?.Loader;
        if (Loader && (Loader as any)._instances) {
          // Clear all instances
          (Loader as any)._instances.clear();
        }
        
        // Also try to clear any cached loaders by ID
        if ((window as any).__googleMapsLoaderCache) {
          delete (window as any).__googleMapsLoaderCache['google-map-script-ivf'];
          delete (window as any).__googleMapsLoaderCache['google-map-script'];
        }
      } catch (e) {
        // Silently ignore if cache doesn't exist or can't be cleared
      }
    }
  }, []);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: ['geometry', 'maps'],
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

