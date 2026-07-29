import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import levels from "../onboarding/data/levels.json";
import ConfirmDialog from "./ConfirmDialog";

const ROUTE_TO_LEVEL_ID: Record<string, string> = {};
const LEVEL_TITLE: Record<string, string> = {};
for (const level of levels) {
    if (!level.tourStepsFile) continue; // level-0 has no tour, just a welcome screen
    const realRoute = level.route.replace(/^\/onboarding/, "");
    if (!(realRoute in ROUTE_TO_LEVEL_ID)) ROUTE_TO_LEVEL_ID[realRoute] = level.id;
    LEVEL_TITLE[level.id] = level.title;
}

const TourEntryButton = ({ label }: { label?: string }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [confirmOpen, setConfirmOpen] = useState(false);

    const levelId = ROUTE_TO_LEVEL_ID[location.pathname];
    if (!levelId) return null;

    const openConfirm = () => setConfirmOpen(true);

    const startTour = () => {
        setConfirmOpen(false);
        // Land on the replica route; PreviewTourOverlay reads this state and opens the
        // level's welcome card. "Begin Tour" there starts the walkthrough.
        navigate(`/onboarding${location.pathname}`, {
            state: { previewLevelId: levelId, returnTo: location.pathname },
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
                    message={`We'll walk you through ${LEVEL_TITLE[levelId] ?? "this page"} step by step. You can exit anytime.`}
                    confirmLabel="Start Tour"
                    onConfirm={startTour}
                    onCancel={() => setConfirmOpen(false)}
                />
            )}
        </>
    );
};

export default TourEntryButton;
