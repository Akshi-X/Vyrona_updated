import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { pageTours } from "../onboarding/data";
import ConfirmDialog from "./ConfirmDialog";

// Real page route → its page tour. Decoupled from the gamified Timeline levels, so
// every page can offer its own contextual walkthrough. `target` is the /onboarding
// replica route the tour launches on.
const ROUTE_TO_TOUR: Record<string, { id: string; title: string; target: string }> = {};
// Tours that match dynamic routes (e.g. /cryocan-tracking/:tankId) by prefix rather
// than exact pathname. Checked only when no exact match is found.
const PREFIX_TOURS: { base: string; id: string; title: string; target: string }[] = [];
for (const tour of pageTours) {
    const realRoute = tour.route.replace(/^\/onboarding/, "");
    if (!(realRoute in ROUTE_TO_TOUR)) {
        ROUTE_TO_TOUR[realRoute] = { id: tour.id, title: tour.title, target: tour.route };
    }
    if (tour.matchPrefix) {
        PREFIX_TOURS.push({ base: realRoute, id: tour.id, title: tour.title, target: tour.route });
    }
}

const TourEntryButton = ({ label }: { label?: string }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Exact route match first; fall back to prefix tours for dynamic routes.
    const exactTour = ROUTE_TO_TOUR[location.pathname];
    const prefixTour = exactTour
        ? undefined
        : PREFIX_TOURS.find(
              (t) => location.pathname === t.base || location.pathname.startsWith(`${t.base}/`),
          );
    const tour = exactTour ?? prefixTour;
    if (!tour) return null;

    // Exact matches land on the current path's replica; prefix matches (dynamic routes)
    // land on the tour's own replica route so we never hit an arbitrary :tankId.
    const replicaTarget = exactTour ? `/onboarding${location.pathname}` : tour.target;

    const openConfirm = () => setConfirmOpen(true);

    const startTour = () => {
        setConfirmOpen(false);
        // Land on the replica route; PreviewTourOverlay reads this state and opens the
        // tour's welcome card. "Begin Tour" there starts the walkthrough.
        navigate(replicaTarget, {
            state: { previewLevelId: tour.id, returnTo: location.pathname },
        });
    };

    const trigger = label ? (
        // Labeled variant (dashboard action row): flat icon + label, matching the
        // neighbouring alert/message/task icons rather than the bordered circle.
        <div
            className="flex flex-col items-center gap-1 cursor-pointer"
            onClick={openConfirm}
            role="button"
            title="Take a tour"
            aria-label="Take a tour of this page"
        >
            <HelpCircle className="w-[28px] h-[28px] text-primary" strokeWidth={2} />
            <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">{label}</span>
        </div>
    ) : (
        <button
            type="button"
            onClick={openConfirm}
            title="Take a tour"
            aria-label="Take a tour of this page"
            className="w-6 h-6 flex items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-primary transition-colors hover:bg-primary/10 shrink-0"
        >
            <HelpCircle size={13} />
        </button>
    );

    return (
        <>
            {trigger}
            {confirmOpen && (
                <ConfirmDialog
                    title="Start the guided tour?"
                    message={`We'll walk you through ${tour.title ?? "this page"} step by step. You can exit anytime.`}
                    confirmLabel="Start Tour"
                    onConfirm={startTour}
                    onCancel={() => setConfirmOpen(false)}
                />
            )}
        </>
    );
};

export default TourEntryButton;
