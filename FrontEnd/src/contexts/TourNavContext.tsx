import React, { createContext, useContext, useState } from "react";

export type PreviewPhase = "welcome" | "tour" | "done";

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
    is_wide?: boolean;
    gif?: string;
}

export interface TourNavContextValue {
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
    returnPath: string | null;
    setReturnPath: (p: string | null) => void;
    // Set while a tour was launched from a real page's TourEntryButton. Marks the
    // whole session as a "preview" (welcome card first, no DB writes) and keeps the
    // right level mounted for the duration.
    previewLevelId: string | null;
    setPreviewLevelId: (id: string | null) => void;
    // Which stage the preview session is in: welcome card, running tour, or the
    // final exit card. Persisted so a refresh resumes to the right screen.
    previewPhase: PreviewPhase | null;
    setPreviewPhase: (phase: PreviewPhase | null) => void;
}

const TourNavContext = createContext<TourNavContextValue | null>(null);

export function TourNavStoreProvider({ children }: { children: React.ReactNode }) {
    const [nav, setNav] = useState<TourNavState | null>(null);
    const [startTour, setStartTourState] = useState<(() => void) | null>(null);
    const [openOverlay, setOpenOverlayState] = useState<(() => void) | null>(null);
    const [pendingStartLevelId, setPendingStartLevelId] = useState<string | null>(null);
    const [isTourActive, setIsTourActive] = useState(false);

    const [returnPath, setReturnPath] = useState<string | null>(null);
    const [previewLevelId, setPreviewLevelId] = useState<string | null>(null);
    const [previewPhase, setPreviewPhase] = useState<PreviewPhase | null>(null);

    const setStartTour = (fn: (() => void) | null) =>
        setStartTourState(() => fn);

    const setOpenOverlay = (fn: (() => void) | null) =>
        setOpenOverlayState(() => fn);

    return (
        <TourNavContext.Provider value={{ nav, setNav, startTour, setStartTour, openOverlay, setOpenOverlay, pendingStartLevelId, setPendingStartLevelId, isTourActive, setIsTourActive, returnPath, setReturnPath, previewLevelId, setPreviewLevelId, previewPhase, setPreviewPhase }}>
            {children}
        </TourNavContext.Provider>

    );
}

export const useTourNavContext = () => useContext(TourNavContext);
