import { useMemo } from "react";
import { useOnboarding } from "../../contexts/OnboardingContext";

const SECTIONS = [
    {
        title: "Welcome to the Quest",
        text: "Explore the platform through guided tours and unlock new levels as you earn points.",
    },
    {
        title: "Play to Learn",
        text: "Each level combines an interactive tour with a short quiz. Pass the quiz to advance.",
    },
    {
        title: "Stay in Control",
        text: "Track your progress and unlock new missions after the cool-down period.",
    },
];

interface OnboardingWelcomeProps {
    onStart?: () => void;
}

export default function OnboardingWelcome({ onStart }: OnboardingWelcomeProps) {
    const { state, advanceWelcome, logEvent } = useOnboarding();

    const visibleSections = useMemo(() => SECTIONS.slice(0, state.welcomeStage + 1), [state.welcomeStage]);

    const handleNext = () => {
        advanceWelcome();
        logEvent({ type: "welcome_next" });
    };

    const handleStart = () => {
        logEvent({ type: "welcome_start", levelId: "level-1" });
        onStart?.();
    };

    return (
        <div className="mx-auto max-w-4xl">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-8 ">
                <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-6">
                        {visibleSections.map((section) => (
                            <div key={section.title} className="space-y-2">
                                <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
                                <p className="text-sm text-slate-600">{section.text}</p>
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-3">
                            {state.welcomeStage < SECTIONS.length - 1 && (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                                >
                                    Next
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleStart}
                                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                            >
                                Start Tour →
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-center">
                        <img
                            src="/genie/hi.jpeg"
                            alt="Genie"
                            className="h-56 w-56 object-cover"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
