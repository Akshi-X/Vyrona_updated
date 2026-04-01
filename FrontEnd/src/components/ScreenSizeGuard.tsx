import { ReactNode, useEffect, useState } from "react";

type ScreenSizeGuardProps = {
    children: ReactNode;
    minWidth?: number;
};

const DEFAULT_MIN_WIDTH = 768;

const ScreenSizeGuard = ({
    children,
    minWidth = DEFAULT_MIN_WIDTH,
}: ScreenSizeGuardProps) => {
    const [isTooSmall, setIsTooSmall] = useState(false);

    useEffect(() => {
        const query = `(max-width: ${minWidth - 1}px)`;
        const media = window.matchMedia(query);

        const update = () => {
            setIsTooSmall(media.matches);
        };

        update();

        if (media.addEventListener) {
            media.addEventListener("change", update);
        } else {
            media.addListener(update);
        }

        return () => {
            if (media.removeEventListener) {
                media.removeEventListener("change", update);
            } else {
                media.removeListener(update);
            }
        };
    }, [minWidth]);

    useEffect(() => {
        if (!isTooSmall) {
            return;
        }

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isTooSmall]);

    return (
        <>
            {children}
            {isTooSmall ? (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 px-6"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Desktop only"
                >
                    <div className="w-full max-w-lg rounded-2xl bg-white px-8 py-10 text-center shadow-2xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Desktop Required
                        </p>
                        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
                            Please use a laptop or desktop to log in
                        </h1>
                        <p className="mt-3 text-base text-slate-600">
                            This dashboard is optimized for larger screens and is not available on
                            mobile devices.
                        </p>
                    </div>
                </div>
            ) : null}
        </>
    );
};

export default ScreenSizeGuard;
