import { useOnboarding } from "../../contexts/OnboardingContext";
import { level0Config } from "../../onboarding/data";

interface OnboardingWelcomeProps {
    onStart?: () => void;
}

export default function OnboardingWelcome({ onStart }: OnboardingWelcomeProps) {
    const { completeLevel } = useOnboarding();

    const sections = level0Config?.sections ?? [];

    const handleStart = () => {
        completeLevel("level-0", 0);
        onStart?.();
    };

    return (
        <div className="mx-auto max-w-4xl">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-8">
                <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-6">
                        {sections.map((section) => (
                            <div key={section.title} className="space-y-2">
                                <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
                                <p className="text-sm text-slate-600">{section.text}</p>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={handleStart}
                            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                        >
                            Start Tour →
                        </button>
                    </div>
                    <div className="flex items-center justify-center">
                        <img
                            src="/genie/welcoming_with_waving_hand.webp"
                            alt="Genie"
                            className="h-56 w-56 object-cover"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
