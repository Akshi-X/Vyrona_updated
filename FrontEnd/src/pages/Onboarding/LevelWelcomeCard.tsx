import { useOnboarding } from "../../contexts/OnboardingContext";

interface LevelWelcomeCardProps {
    levelId: string;
    onBeginTour: () => void;
}

export default function LevelWelcomeCard({ levelId, onBeginTour }: LevelWelcomeCardProps) {
    const { levels } = useOnboarding();
    const levelConfig = levels.find((l) => l.id === levelId);
    const welcome = levelConfig?.welcome;

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-4">
                {welcome?.badge && (
                    <span className="text-5xl leading-none">{welcome.badge}</span>
                )}
                <div className="space-y-1 min-w-0">
                    {welcome?.subtitle && (
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                            {welcome.subtitle}
                        </p>
                    )}
                    <h3 className="text-xl font-semibold text-slate-900">
                        {welcome?.title ?? levelConfig?.title}
                    </h3>
                </div>
            </div>

            {welcome?.description && (
                <p className="text-sm text-slate-600 leading-relaxed">{welcome.description}</p>
            )}

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Pass threshold</span>
                    <span className="font-semibold text-slate-700">{levelConfig?.pointsRequired} pts</span>
                </div>
            </div>

            <button
                type="button"
                onClick={onBeginTour}
                className="inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
            >
                Begin Tour →
            </button>
        </div>
    );
}
