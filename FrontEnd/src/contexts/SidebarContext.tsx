import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type SidebarContextType = {
    isMobileOpen: boolean;
    openMobile: () => void;
    closeMobile: () => void;
    toggleMobile: () => void;
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    return (
        <SidebarContext.Provider
            value={{
                isMobileOpen,
                openMobile: () => setIsMobileOpen(true),
                closeMobile: () => setIsMobileOpen(false),
                toggleMobile: () => setIsMobileOpen((v) => !v),
            }}
        >
            {children}
        </SidebarContext.Provider>
    );
};

export const useSidebar = (): SidebarContextType => {
    const ctx = useContext(SidebarContext);
    if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
    return ctx;
};
