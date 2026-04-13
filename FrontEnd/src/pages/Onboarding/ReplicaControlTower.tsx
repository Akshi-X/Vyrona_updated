import { onboardingMocks } from "../../onboarding/data";

export default function ReplicaControlTower() {
    const data = onboardingMocks["control-tower"];

    return (
        <div className="space-y-6">
            <section id="onboarding-control-map" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Global Map</p>
                        <h3 className="text-lg font-semibold text-slate-900">Active Lanes Overview</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Map Preview</span>
                </div>
                <div className="mt-4 h-40 rounded-xl bg-gradient-to-br from-[#E0F7FF] via-[#EDE8FF] to-[#FFF1E1]" />
            </section>
            <section id="onboarding-control-kpis" className="grid gap-4 md:grid-cols-3">
                {data.kpis.map((kpi) => (
                    <div key={kpi.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{kpi.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{kpi.value}</p>
                    </div>
                ))}
            </section>
            <section id="onboarding-control-actions" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Mitigation Actions</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {data.actions.map((action) => (
                        <div key={action.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <p className="font-semibold text-slate-800">{action.title}</p>
                            <p>{action.detail}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
