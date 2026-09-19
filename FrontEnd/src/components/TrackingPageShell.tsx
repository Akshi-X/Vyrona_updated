import React from "react";
import HamburgerButton from "./HamburgerButton";

interface TrackingPageShellProps {
    children: React.ReactNode;
}

/**
 * Full-screen wallpaper backdrop + mobile hamburger used by the cryocan/incubator/
 * refrigerator "select branch and device" search pages, so all three stay visually
 * identical instead of drifting independently.
 */
const TrackingPageShell: React.FC<TrackingPageShellProps> = ({ children }) => {
    return (
        <div className="flex-1 min-h-screen flex items-center justify-center relative">
            <div
                className="absolute inset-0 pointer-events-none z-0"
                style={{
                    backgroundImage: "url(/ivf_pattern.png)",
                    backgroundSize: "20%",
                    backgroundRepeat: "repeat",
                    opacity: 0.35,
                }}
            />
            <div className="fixed top-3 left-4 z-30 md:hidden">
                <HamburgerButton />
            </div>
            {children}
        </div>
    );
};

export default TrackingPageShell;
