import React, { createContext, useContext, useState } from "react";

export interface TourNavState {
    title: string;
    icon: string;
    content: string;
    stepIndex: number;
    totalSteps: number;
    canNext: boolean;
    canPrev: boolean;
    prevLocked: boolean;
    requiresClick: boolean;
    goNext: () => void;
    goPrev: () => void;
}

interface TourNavContextValue {
    nav: TourNavState | null;
    setNav: (nav: TourNavState | null) => void;
}

const TourNavContext = createContext<TourNavContextValue | null>(null);

export function TourNavStoreProvider({ children }: { children: React.ReactNode }) {
    const [nav, setNav] = useState<TourNavState | null>(null);
    return (
        <TourNavContext.Provider value={{ nav, setNav }}>
            {children}
        </TourNavContext.Provider>
    );
}

export const useTourNavContext = () => useContext(TourNavContext);
