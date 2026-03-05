import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import "@fontsource/work-sans";
import "@fontsource/open-sans";
import router from "./routes";
import { AuthProvider } from "./contexts/AuthContext";
import { GoogleMapsProvider } from "./contexts/GoogleMapsProvider";
import { UIVariantProvider } from "./contexts/UIVariantContext";
import { initializeHealthCheck } from "./utils/variantHealthCheck";

// Initialize variant health check in development/staging
// This runs async and logs results to console
if (import.meta.env.DEV) {
    initializeHealthCheck();
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AuthProvider>
            <UIVariantProvider>
                <GoogleMapsProvider>
                    <RouterProvider router={router} />
                </GoogleMapsProvider>
            </UIVariantProvider>
        </AuthProvider>
    </StrictMode>,
);
