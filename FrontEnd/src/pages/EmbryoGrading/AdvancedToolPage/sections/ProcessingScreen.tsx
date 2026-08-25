import { Brain } from 'lucide-react';

export default function ProcessingScreen({ oocyteNo, progress, stage, resumed, skipped }: {
  oocyteNo: number | null; progress: number; stage: string; resumed?: boolean; skipped?: string[];
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-[420px] rounded-2xl border border-line bg-white">
      <div className="relative">
        <div className="w-24 h-24 rounded-full border-4 border-[#E8D5F5] border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain size={22} className="text-primary" />
          </div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-primary">AI Grading in Progress</p>
        <p className="text-xs text-gray-400 mt-1">Analyzing embryo images for Oocyte #{oocyteNo ?? '—'}</p>
        {resumed && (
          <p className="text-[11px] text-primary/70 mt-1.5">Reconnected — this run started before the page reloaded</p>
        )}
        {!!skipped?.length && (
          <p className="text-[11px] font-semibold text-red-500 mt-1.5">
            Skipped {skipped.length} image{skipped.length > 1 ? 's' : ''} — no embryo detected
          </p>
        )}
      </div>

      <div className="w-full max-w-sm flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-500">{stage || 'Starting'}</span>
          <span className="text-[11px] font-black text-primary tabular-nums">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: 'var(--gradient-primary)' }} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        {['Expansion grading', 'ICM classification', 'TE scoring', 'Quality assessment'].map((label, i) => (
          <span key={label} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium"
            style={{ opacity: 0, animation: `fade-in 0.3s ease forwards ${0.3 + i * 0.3}s` }}>{label}</span>
        ))}
      </div>
      <style>{`@keyframes fade-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  );
}
