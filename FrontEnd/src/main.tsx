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
import { SidebarProvider } from "./contexts/SidebarContext";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AuthProvider>
            <UIVariantProvider>
                <GoogleMapsProvider>
                    <SidebarProvider>
                        <RouterProvider router={router} />
                    </SidebarProvider>
                </GoogleMapsProvider>
            </UIVariantProvider>
        </AuthProvider>
    </StrictMode>,
);
