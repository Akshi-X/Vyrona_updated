/**
 * Full-page loader: white background, spinner centered.
 * Matches the existing app loader style (animate-spin, border-b-2, brand color).
 * Use when blocking the whole screen until a critical fetch (e.g. UI variants) completes.
 */

import React from "react";

export const FullPageLoader: React.FC = () => (
    <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-white"
        aria-busy="true"
        aria-label="Loading"
    >
        <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
            role="status"
            aria-hidden="true"
        />
    </div>
);

export default FullPageLoader;
