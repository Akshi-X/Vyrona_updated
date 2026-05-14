import { onboardingMocks } from "../../onboarding/data";

export default function ReplicaDashboard() {
    const data = onboardingMocks.dashboard;

    return (
        <div className="space-y-6">
            <section id="onboarding-dashboard-kpis" className="grid gap-4 md:grid-cols-3">
                {data.kpis.map((kpi) => (
                    <div
                        key={kpi.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{kpi.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{kpi.value}</p>
                    </div>
                ))}
            </section>
            <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div
                    id="onboarding-dashboard-alerts"
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                    <h3 className="text-sm font-semibold text-slate-900">Alert Feed</h3>
                    <ul className="mt-3 space-y-3 text-sm text-slate-600">
                        {data.alerts.map((alert) => (
                            <li key={alert.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <p className="font-semibold text-slate-800">{alert.title}</p>
                                <p>{alert.detail}</p>
                            </li>
                        ))}
                    </ul>
                </div>
                <div
                    id="onboarding-dashboard-shipments"
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                    <h3 className="text-sm font-semibold text-slate-900">Critical Shipments</h3>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {data.shipments.map((shipment) => (
                            <div key={shipment.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div>
                                    <p className="font-semibold text-slate-800">{shipment.lane}</p>
                                    <p>{shipment.status}</p>
                                </div>
                                <span className="text-xs font-semibold text-slate-500">{shipment.eta}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
