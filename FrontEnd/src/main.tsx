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
import ScreenSizeGuard from "./components/ScreenSizeGuard";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AuthProvider>
            <UIVariantProvider>
                <GoogleMapsProvider>
                    <ScreenSizeGuard>
                        <RouterProvider router={router} />
                    </ScreenSizeGuard>
                </GoogleMapsProvider>
            </UIVariantProvider>
        </AuthProvider>
    </StrictMode>,
);
