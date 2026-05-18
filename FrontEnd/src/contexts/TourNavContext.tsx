import React, { createContext, useContext, useState } from "react";

export interface TourNavState {
    title: string;
    icon: string;
    content: string;
    genieImage?: string;
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
    startTour: (() => void) | null;
    setStartTour: (fn: (() => void) | null) => void;
    openOverlay: (() => void) | null;
    setOpenOverlay: (fn: (() => void) | null) => void;
    pendingStartLevelId: string | null;
    setPendingStartLevelId: (id: string | null) => void;
    isTourActive: boolean;
    setIsTourActive: (v: boolean) => void;
}

const TourNavContext = createContext<TourNavContextValue | null>(null);

export function TourNavStoreProvider({ children }: { children: React.ReactNode }) {
    const [nav, setNav] = useState<TourNavState | null>(null);
    const [startTour, setStartTourState] = useState<(() => void) | null>(null);
    const [openOverlay, setOpenOverlayState] = useState<(() => void) | null>(null);
    const [pendingStartLevelId, setPendingStartLevelId] = useState<string | null>(null);
    const [isTourActive, setIsTourActive] = useState(false);

    const setStartTour = (fn: (() => void) | null) =>
        setStartTourState(() => fn);

    const setOpenOverlay = (fn: (() => void) | null) =>
        setOpenOverlayState(() => fn);

    return (
        <TourNavContext.Provider value={{ nav, setNav, startTour, setStartTour, openOverlay, setOpenOverlay, pendingStartLevelId, setPendingStartLevelId, isTourActive, setIsTourActive }}>
            {children}
        </TourNavContext.Provider>

    );
}

export const useTourNavContext = () => useContext(TourNavContext);
