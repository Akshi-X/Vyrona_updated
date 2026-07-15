import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { toast } from "react-toastify";
import {
    Battery,
    Bell,
    BellOff,
    CloudRain,
    Loader2,
    Mail,
    Thermometer,
    ThermometerSun,
    Zap,
} from "lucide-react";
import { ivfService, type KpiConfigRow } from "../../services/ivfService";
import MiniTank3D from "./MiniTank3D";

// ─── KPI config metadata ─────────────────────────────────────────────────────

const KPI = {
    TEMP_INTERNAL: "temp_internal",
    TEMP_EXTERNAL: "temp_external",
    LN2_LEVEL: "ln2_level",
    LN2_EVAPORATION: "ln2_evaporation_rate",
    SHOCK: "shock",
    BATTERY: "tive_battery_percentage",
    HUMIDITY: "humidity",
    LID_STATE: "ln2_lid_state",
} as const;

interface KpiSliderMeta {
    label: string;
    unit: string;
    lo: number;
    hi: number;
    step: number;
    dual: boolean;
}

const KPI_META: Record<string, KpiSliderMeta> = {
    [KPI.TEMP_INTERNAL]: { label: "Internal Temperature", unit: "°C", lo: -240, hi: -140, step: 0.5, dual: true },
    [KPI.TEMP_EXTERNAL]: { label: "External Temperature", unit: "°C", lo: 15, hi: 55, step: 0.5, dual: true },
    [KPI.LN2_LEVEL]: { label: "LN2", unit: "Ln2 in kg", lo: 0, hi: 100, step: 1, dual: false },
    [KPI.LN2_EVAPORATION]: { label: "Evaporation Rate", unit: "kg/hr", lo: -0.5, hi: 1.5, step: 0.05, dual: true },
    [KPI.SHOCK]: { label: "Shock Detection", unit: "g", lo: 0, hi: 10, step: 0.1, dual: true },
    [KPI.BATTERY]: { label: "Battery Level", unit: "%", lo: 0, hi: 100, step: 1, dual: false },
    [KPI.HUMIDITY]: { label: "Humidity", unit: "%", lo: 0, hi: 100, step: 1, dual: true },
    [KPI.LID_STATE]: { label: "Lid State", unit: "", lo: 0, hi: 1, step: 1, dual: false },
};

const EDITABLE_KPIS = Object.keys(KPI_META);

interface KpiDraft {
    min: number | null;
    max: number | null;
    /** Master alert switch for this KPI. */
    enabled: boolean;
    whatsapp_alert: boolean;
    email_alert: boolean;
    /** Needs an active channel: escalate to admins after N consecutive unacknowledged alerts (0 = immediate, null = disabled). */
    unack_escalation_threshold?: number | null;
}

/** KPIs whose channels default ON the first time the master switch is enabled. */
const DEFAULT_CHANNELS_ON = new Set<string>([KPI.TEMP_INTERNAL, KPI.LN2_LEVEL, KPI.LID_STATE]);

/** One-click safe defaults applied by the "Set Recommended" button. */
const RECOMMENDED: Record<string, KpiDraft> = {
    [KPI.TEMP_INTERNAL]: { min: -200, max: -180, enabled: true, whatsapp_alert: true, email_alert: true },
    [KPI.TEMP_EXTERNAL]: { min: 18, max: 40, enabled: true, whatsapp_alert: false, email_alert: false },
    [KPI.LN2_LEVEL]: { min: 20, max: null, enabled: true, whatsapp_alert: true, email_alert: true },
    [KPI.LN2_EVAPORATION]: { min: 0, max: 1, enabled: true, whatsapp_alert: false, email_alert: false },
    [KPI.SHOCK]: { min: 0, max: 3, enabled: true, whatsapp_alert: false, email_alert: false },
    [KPI.BATTERY]: { min: 20, max: null, enabled: true, whatsapp_alert: false, email_alert: false },
    [KPI.HUMIDITY]: { min: 30, max: 70, enabled: true, whatsapp_alert: false, email_alert: false },
    [KPI.LID_STATE]: { min: 0, max: 0, enabled: true, whatsapp_alert: true, email_alert: true },
};

export interface CryoBentoGridHandle {
    /** Fill all KPI drafts with the recommended thresholds (still needs Save Changes). */
    applyRecommended: () => void;
}

const EMPTY_DRAFT: KpiDraft = {
    min: null,
    max: null,
    enabled: false,
    whatsapp_alert: false,
    email_alert: false,
    unack_escalation_threshold: null,
};

/** Patch applied when the master switch turns on: core KPIs get both channels by default. */
const enablePatch = (kpiName: string, d: KpiDraft): Partial<KpiDraft> => ({
    enabled: true,
    ...(DEFAULT_CHANNELS_ON.has(kpiName) && !d.whatsapp_alert && !d.email_alert
        ? { whatsapp_alert: true, email_alert: true }
        : {}),
    ...(kpiName === KPI.LID_STATE ? { min: 0, max: 0 } : {}),
});

const sameDraft = (a?: KpiDraft, b?: KpiDraft) =>
    (a?.min ?? null) === (b?.min ?? null) &&
    (a?.max ?? null) === (b?.max ?? null) &&
    (a?.enabled ?? false) === (b?.enabled ?? false) &&
    (a?.whatsapp_alert ?? false) === (b?.whatsapp_alert ?? false) &&
    (a?.email_alert ?? false) === (b?.email_alert ?? false) &&
    (a?.unack_escalation_threshold ?? null) === (b?.unack_escalation_threshold ?? null);

// ─── Live data model ─────────────────────────────────────────────────────────

interface LiveData {
    tempCurrent: number | null;
    extTempCurrent: number | null;
    shockCurrent: number | null;
    battery: number | null;
    ln2Pct: number | null;
    evapCurrent: number | null;
    refillDays: number | null;
    lidOpen: boolean | null;
}

const EMPTY_LIVE: LiveData = {
    tempCurrent: null,
    extTempCurrent: null,
    shockCurrent: null,
    battery: null,
    ln2Pct: null,
    evapCurrent: null,
    refillDays: null,
    lidOpen: null,
};

// ─── Bento primitives ────────────────────────────────────────────────────────

const INK = "#2E2A24";
const INK_SOFT = "#000000";

function BentoCard({
    className = "",
    children,
    delay = 0,
}: {
    className?: string;
    children: ReactNode;
    delay?: number;
}) {
    return (
        <div
            className={`cryo-in relative overflow-hidden rounded-[24px] shadow-[0_10px_34px_rgba(83,63,29,0.09)] ${className}`}
            style={{ animationDelay: `${delay}ms`, color: INK } as CSSProperties}
        >
            {children}
        </div>
    );
}

function CardTitle({ children }: { children: ReactNode }) {
    return <h3 className="text-[16px] font-extrabold tracking-tight">{children}</h3>;
}

function MicroLabel({ children }: { children: ReactNode }) {
    return (
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: INK_SOFT }}>
            {children}
        </span>
    );
}

// ─── Threshold editing controls ──────────────────────────────────────────────

/** Bottom control bar: bell status, WhatsApp / email channel buttons, master switch. */
function ChannelBar({
    kpiName,
    draft,
    onDraft,
}: {
    kpiName: string;
    draft: KpiDraft;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    const on = draft.enabled;
    const statusText = !on
        ? "Alerts are off — you won't be notified for this KPI."
        : draft.whatsapp_alert && draft.email_alert
          ? "Alerts arrive in-app, on WhatsApp and by email."
          : draft.whatsapp_alert
            ? "Alerts arrive in-app and on WhatsApp."
            : draft.email_alert
              ? "Alerts arrive in-app and by email."
              : "Alerts arrive in-app only.";
    return (
        <div
            className={`relative mt-1.5 flex items-center gap-2 rounded-full px-2 py-1 transition-colors duration-200 ${
                on ? "bg-white" : "bg-white/60"
            }`}
        >
            <div
                className={`w-9 h-9 rounded-full grid place-items-center shrink-0 transition-colors duration-200 ${
                    on ? "bg-primary-light" : "bg-gray-200"
                }`}
            >
                {on ? (
                    <Bell size={16} className="text-white" />
                ) : (
                    <BellOff size={16} className="text-gray-500" />
                )}
            </div>
            <div className="w-px h-6 bg-gray-300 shrink-0" />
            <p className="flex-1 min-w-0 px-1 text-[10px] leading-tight font-semibold text-black">
                {statusText}
            </p>
            <button
                type="button"
                aria-pressed={on && draft.whatsapp_alert}
                aria-label="WhatsApp alerts"
                title={on ? "WhatsApp alerts" : "Turn the alert on first"}
                disabled={!on}
                onClick={() =>
                    onDraft(kpiName, {
                        whatsapp_alert: !draft.whatsapp_alert,
                        // Escalation needs at least one channel; clear it when the last one goes off
                        ...(draft.whatsapp_alert && !draft.email_alert && { unack_escalation_threshold: null }),
                    })
                }
                className="relative w-9 h-9 rounded-xl bg-white border border-gray-200 grid place-items-center shrink-0 transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/40"
            >
                <img
                    src="/250px-WhatsApp.svg.webp"
                    alt=""
                    className={`w-5 h-5 transition-all duration-200 ${on && draft.whatsapp_alert ? "" : "grayscale opacity-40"}`}
                />
                {on && draft.whatsapp_alert && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
                )}
            </button>
            <button
                type="button"
                aria-pressed={on && draft.email_alert}
                aria-label="Email alerts"
                title={on ? "Email alerts" : "Turn the alert on first"}
                disabled={!on}
                onClick={() =>
                    onDraft(kpiName, {
                        email_alert: !draft.email_alert,
                        // Escalation needs at least one channel; clear it when the last one goes off
                        ...(draft.email_alert && !draft.whatsapp_alert && { unack_escalation_threshold: null }),
                    })
                }
                className="relative w-9 h-9 rounded-xl bg-white border border-gray-200 grid place-items-center shrink-0 transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/40"
            >
                <Mail size={16} className={`transition-colors duration-200 ${on && draft.email_alert ? "text-[#6b1176]" : "text-gray-300"}`} />
                {on && draft.email_alert && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
                )}
            </button>
            <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label="Alert on/off"
                onClick={() =>
                    onDraft(
                        kpiName,
                        on
                            ? { enabled: false, unack_escalation_threshold: null }
                            : enablePatch(kpiName, draft),
                    )
                }
                className={`relative w-[52px] h-8 rounded-full shrink-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/40 ${
                    on ? "bg-primary-light" : "bg-gray-300"
                }`}
            >
                <span
                    className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-200 ${
                        on ? "translate-x-5" : "translate-x-0"
                    }`}
                />
            </button>
        </div>
    );
}

/** Number input that commits on blur/Enter so partial typing isn't clamped mid-edit. */
function ThresholdField({
    label,
    value,
    unit,
    lo,
    hi,
    step,
    onCommit,
}: {
    label: string;
    value: number | null;
    unit: string;
    lo: number;
    hi: number;
    step: number;
    onCommit: (v: number | null) => void;
}) {
    const [text, setText] = useState(value != null ? String(value) : "");
    useEffect(() => {
        setText(value != null ? String(value) : "");
    }, [value]);
    const commit = () => {
        if (text.trim() === "") {
            onCommit(null);
            return;
        }
        const n = Number(text);
        if (!Number.isFinite(n)) {
            setText(value != null ? String(value) : "");
            return;
        }
        onCommit(Math.min(hi, Math.max(lo, n)));
    };
    return (
        <label className="flex items-center gap-1">
            <span className="text-[10px] font-bold" style={{ color: INK_SOFT }}>{label}</span>
            <input
                type="number"
                min={lo}
                max={hi}
                step={step}
                value={text}
                placeholder="—"
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                }}
                aria-label={label}
                className="w-16 rounded-lg bg-white/80 px-1 py-0.5 text-[11px] font-bold text-center outline-none focus:ring-2 focus:ring-black/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {unit && <span className="text-[10px] font-bold" style={{ color: INK_SOFT }}>{unit}</span>}
        </label>
    );
}

function KpiSlider({
    meta,
    draft,
    ink,
    onChange,
    currentReading,
}: {
    meta: KpiSliderMeta;
    draft: KpiDraft;
    ink: string;
    onChange: (min: number | null, max: number | null) => void;
    currentReading?: number | null;
}) {
    const a = draft.min ?? meta.lo;
    const b = draft.max ?? meta.hi;
    const pct = (v: number) => ((v - meta.lo) / (meta.hi - meta.lo)) * 100;
    const fmt = (v: number) =>
        Number.isInteger(meta.step) ? String(Math.round(v)) : String(Number(v.toFixed(meta.step < 0.1 ? 2 : 1)));
    const scaleTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => meta.lo + t * (meta.hi - meta.lo));
    return (
        <div style={{ "--thumb": ink } as CSSProperties}>
            <div className="relative select-none">
                <div className="relative h-8">
                    {currentReading != null && (
                        <div
                            className="absolute left-0 right-0 top-0 flex justify-center pointer-events-none"
                            style={{
                                left: `${pct(currentReading)}%`,
                                transform: "translateX(-50%)",
                                width: "fit-content",
                            }}
                        >
                            <div className="flex flex-col items-center gap-0.25">
                                <span className="text-[8px] font-bold text-green-600 whitespace-nowrap">Latest</span>
                                <div className="w-0.5 h-3 bg-green-500 rounded-full opacity-80" />
                            </div>
                        </div>
                    )}
                </div>
                <div className="relative h-7">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-white/70" />
                    <div
                        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full transition-all duration-150"
                        style={{
                            left: `${meta.dual ? pct(Math.min(a, b)) : 0}%`,
                            right: `${100 - pct(meta.dual ? Math.max(a, b) : a)}%`,
                            backgroundColor: ink,
                            opacity: 0.8,
                        }}
                    />
                    {meta.dual ? (
                        <>
                            <input
                                type="range"
                                className="cryo-range"
                                min={meta.lo}
                                max={meta.hi}
                                step={meta.step}
                                value={a}
                                onChange={(e) => onChange(Math.min(Number(e.target.value), b), b)}
                                aria-label={`${meta.label} minimum`}
                            />
                            <input
                                type="range"
                                className="cryo-range"
                                min={meta.lo}
                                max={meta.hi}
                                step={meta.step}
                                value={b}
                                onChange={(e) => onChange(a, Math.max(Number(e.target.value), a))}
                                aria-label={`${meta.label} maximum`}
                            />
                        </>
                    ) : (
                        <input
                            type="range"
                            className="cryo-range cryo-range-solo"
                            min={meta.lo}
                            max={meta.hi}
                            step={meta.step}
                            value={a}
                            onChange={(e) => onChange(Number(e.target.value), null)}
                            aria-label={`${meta.label} minimum`}
                        />
                    )}
                </div>
            </div>
            <div className="flex justify-between px-0.5">
                {scaleTicks.map((v, i) => (
                    <span
                        key={i}
                        className={`flex flex-col text-[9px] font-semibold leading-tight ${
                            i === 0 ? "items-start" : i === scaleTicks.length - 1 ? "items-end" : "items-center"
                        }`}
                        style={{ color: INK_SOFT }}
                    >
                        <span className="w-px h-1 bg-current opacity-70" />
                        {fmt(v)}
                    </span>
                ))}
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
                <ThresholdField
                    label="Min"
                    value={draft.min}
                    unit={meta.unit}
                    lo={meta.lo}
                    hi={meta.hi}
                    step={meta.step}
                    onCommit={(v) =>
                        onChange(v != null && draft.max != null ? Math.min(v, draft.max) : v, draft.max)
                    }
                />
                {meta.dual && (
                    <ThresholdField
                        label="Max"
                        value={draft.max}
                        unit={meta.unit}
                        lo={meta.lo}
                        hi={meta.hi}
                        step={meta.step}
                        onCommit={(v) =>
                            onChange(draft.min, v != null && draft.min != null ? Math.max(v, draft.min) : v)
                        }
                    />
                )}
            </div>
        </div>
    );
}

function EscalationInput({
    kpiName,
    draft,
    onDraft,
}: {
    kpiName: string;
    draft: KpiDraft;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    const v = draft.unack_escalation_threshold ?? null;
    return (
        <div className="relative h-10 flex items-center justify-between gap-2 mt-1.5 px-3 rounded-2xl bg-orange-100/70 border border-orange-200">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800">Escalation</span>
            <div className="flex items-center gap-1.5">
                <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="—"
                    value={v ?? ""}
                    onChange={(e) => {
                        const raw = e.target.value;
                        onDraft(kpiName, {
                            unack_escalation_threshold: raw === "" ? null : Math.max(0, Math.round(Number(raw))),
                        });
                    }}
                    title="Send escalation email to admins/managers after N consecutive unacknowledged alerts. Leave empty to disable."
                    className="w-10 rounded-lg bg-white/80 px-1 py-0.5 text-[12px] font-bold text-orange-900 text-center outline-none focus:ring-2 focus:ring-orange-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[10px] font-semibold text-orange-700 whitespace-nowrap">
                    {v === null ? "disabled" : v === 0 ? "immediate" : `after ${v} unack`}
                </span>
            </div>
        </div>
    );
}

function EscalationHint({ message }: { message: string }) {
    return (
        <div className="relative h-10 mt-1.5 px-3 rounded-2xl bg-white/35 border border-dashed border-gray-400/50 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: INK_SOFT }}>Escalation</span>
            <p className="text-[10px] font-semibold flex-1 text-right" style={{ color: INK_SOFT }}>
                {message}
            </p>
        </div>
    );
}

/** Escalation row is always visible: input when usable, otherwise a hint on how to unlock it. */
function EscalationRow({
    kpiName,
    draft,
    onDraft,
}: {
    kpiName: string;
    draft: KpiDraft;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    if (draft.enabled && (draft.whatsapp_alert || draft.email_alert)) {
        return <EscalationInput kpiName={kpiName} draft={draft} onDraft={onDraft} />;
    }
    return (
        <EscalationHint
            message={
                draft.enabled
                    ? "Turn on WhatsApp or email alerts to enable escalation"
                    : "Turn on the alert with WhatsApp or email to enable"
            }
        />
    );
}

function ThresholdBox({
    kpiName,
    draft,
    ink,
    onDraft,
    metaOverride,
    currentReading,
}: {
    kpiName: string;
    draft: KpiDraft;
    ink: string;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
    metaOverride?: Partial<KpiSliderMeta>;
    currentReading?: number | null;
}) {
    const meta = { ...KPI_META[kpiName], ...metaOverride };
    return (
        <>
            <div className="relative rounded-2xl bg-white/45 px-3 pt-2 pb-1.5">
                <div className="mb-1">
                    <MicroLabel>Alert threshold</MicroLabel>
                </div>
                <KpiSlider
                    meta={meta}
                    draft={draft}
                    ink={ink}
                    onChange={(min, max) =>
                        onDraft(kpiName, {
                            min,
                            max,
                            // Dragging a slider implies the alert should be live
                            ...(draft.enabled ? {} : enablePatch(kpiName, draft)),
                        })
                    }
                    currentReading={currentReading}
                />
            </div>
            <EscalationRow kpiName={kpiName} draft={draft} onDraft={onDraft} />
            <ChannelBar kpiName={kpiName} draft={draft} onDraft={onDraft} />
        </>
    );
}

// ─── Hero cards ──────────────────────────────────────────────────────────────

function InternalTemperatureCard({
    tankCode,
    live,
    draft,
    editable,
    onDraft,
}: {
    tankCode: string | null;
    live: LiveData;
    draft: KpiDraft;
    editable: boolean;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    return (
        <BentoCard delay={0} className="col-span-12 @min-[81rem]:col-span-5 min-h-[440px] bg-gradient-to-br from-[#ECDCF8] to-[#DFC7F1] p-4 flex flex-col">
            <Thermometer strokeWidth={1.25} className="absolute top-4 right-4 w-28 h-28 text-[#A879D6] opacity-25" />
            <div className="relative">
                <CardTitle>Internal temperature:</CardTitle>
                <p className="text-[12px] mt-0.5 text-gray-500">Cryogenic temperature inside {tankCode ? `tank ${tankCode}` : "the tank"}, where samples are stored</p>
            </div>
            <div className="relative flex-1 flex items-center justify-center">
                <div className="rounded-xl px-6 py-4 bg-white/60 backdrop-blur-sm border border-white/40 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Latest</span>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                    <div className="cryo-display font-extrabold leading-none text-slate-900 text-[34px]">
                        {live.tempCurrent != null ? live.tempCurrent.toFixed(1) : "—"}
                        <span className="text-[16px] font-bold text-slate-500"> °C</span>
                    </div>
                </div>
            </div>
            {editable && (
                <div className="relative mt-auto">
                    <ThresholdBox kpiName={KPI.TEMP_INTERNAL} draft={draft} ink="#6B3A7E" onDraft={onDraft} currentReading={live.tempCurrent} />
                </div>
            )}
        </BentoCard>
    );
}

function Ln2LevelCard({
    live,
    draft,
    editable,
    onDraft,
    usableKg,
    l2Pct,
}: {
    live: LiveData;
    draft: KpiDraft;
    editable: boolean;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
    usableKg: number | null;
    l2Pct: number | null;
}) {
    return (
        <BentoCard delay={60} className="col-span-12 @min-[81rem]:col-span-7 min-h-[440px] bg-gradient-to-br from-[#FADFEC] to-[#F4C8DF] p-4 flex flex-row gap-4">
            {/* ln2.svg is white-only art; mask + backgroundColor tints it like the other decos */}
            <span
                aria-hidden
                className="absolute top-4 right-4 w-28 h-28 opacity-20"
                style={{
                    backgroundColor: "#D4649E",
                    WebkitMaskImage: "url(/ln2.svg)",
                    maskImage: "url(/ln2.svg)",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                }}
            />
            <div className="relative flex flex-col items-start gap-2">
                <div className="relative">
                    <CardTitle>LN2 level:</CardTitle>
                    <p className="text-[12px] mt-0.5 text-gray-500">Liquid nitrogen left in the tank to keep samples frozen</p>
                </div>
                <div className="flex items-center justify-center py-3 self-center">
                    <div className="rounded-xl px-6 py-3 bg-white/60 backdrop-blur-sm border border-white/40 text-center">
                        <div className="flex items-center justify-center gap-2 mb-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Latest</span>
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        </div>
                        <p className="cryo-display text-[34px] font-extrabold leading-none text-slate-900">
                            {live.ln2Pct != null && usableKg != null ? ((live.ln2Pct / 100) * usableKg).toFixed(1) : "—"}
                            <span className="text-[16px] font-bold text-slate-500"> kg</span>
                        </p>
                    </div>
                </div>
                {editable && (
                    <div className="relative">
                        <ThresholdBox
                            kpiName={KPI.LN2_LEVEL}
                            draft={draft}
                            ink="#7C1B4E"
                            onDraft={onDraft}
                            metaOverride={usableKg != null ? { hi: usableKg } : undefined}
                            currentReading={usableKg != null && live.ln2Pct != null ? (live.ln2Pct / 100) * usableKg : null}
                        />
                    </div>
                )}
            </div>
            <div className="relative flex-1 min-h-0 flex flex-col">
                {/* Mini 3D dewar — callout indicators on tank for liquid level + L2 threshold */}
                <div className="flex-1 min-h-0">
                    <MiniTank3D
                        levelPct={live.ln2Pct}
                        l2Pct={l2Pct}
                        usableKg={usableKg}
                        className="w-full h-full"
                    />
                </div>
            </div>
        </BentoCard>
    );
}

function LidStateCard({
    live,
    draft,
    editable,
    onDraft,
}: {
    live: LiveData;
    draft: KpiDraft;
    editable: boolean;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    const known = live.lidOpen != null;
    const open = live.lidOpen === true;
    return (
        <BentoCard delay={120} className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 min-h-[350px] bg-gradient-to-br from-[#E5EDFE] to-[#CFDDFA] p-4 flex flex-col">
            {/* lid_state.svg is white-only art; mask + backgroundColor tints it like the other decos */}
            <span
                aria-hidden
                className="absolute top-4 right-4 w-28 h-28 opacity-20"
                style={{
                    backgroundColor: "#5A83BC",
                    WebkitMaskImage: "url(/lid_state.svg)",
                    maskImage: "url(/lid_state.svg)",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                }}
            />
            <div className="relative">
                <CardTitle>Lid state:</CardTitle>
                <p className="text-[12px] mt-0.5 text-gray-500">Live open / closed status of the tank lid</p>
            </div>
            <div className="relative flex items-center justify-center py-3">
                <div className="rounded-xl px-6 py-3 bg-white/60 backdrop-blur-sm border border-white/40 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Latest</span>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                    <p className={`text-[28px] font-bold leading-tight ${known ? (open ? "text-amber-600" : "text-green-600") : "text-slate-400"}`}>
                        {known ? (open ? "OPEN" : "CLOSED") : "—"}
                    </p>
                </div>
            </div>
            {editable && (
                <div className="relative mt-auto">
                    <div className="rounded-2xl bg-white/45 px-3 pt-2 pb-0 space-y-0.5">
                        <MicroLabel>Alert threshold</MicroLabel>
                        <p className="text-[11px] font-semibold" style={{ color: INK_SOFT }}>
                            Alerts when the lid is opened.
                        </p>
                    </div>
                    <EscalationRow kpiName={KPI.LID_STATE} draft={draft} onDraft={onDraft} />
                    <ChannelBar kpiName={KPI.LID_STATE} draft={draft} onDraft={onDraft} />
                </div>
            )}
        </BentoCard>
    );
}

// ─── Editable secondary cards ────────────────────────────────────────────────

function EditableKpiCard({
    kpiName,
    title,
    reading,
    readingUnit,
    sub,
    gradient,
    ink,
    deco,
    delay,
    className,
    draft,
    editable,
    onDraft,
    currentReading,
}: {
    kpiName: string;
    title: string;
    reading: string;
    readingUnit: string;
    sub: string;
    gradient: string;
    ink: string;
    deco: ReactNode;
    delay: number;
    className: string;
    draft: KpiDraft;
    editable: boolean;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
    currentReading?: number | null;
}) {
    return (
        <BentoCard delay={delay} className={`${className} ${gradient} p-3 flex flex-col gap-2`}>
            {deco}
            <div className="relative">
                <CardTitle>{title}</CardTitle>
                <p className="text-[12px] mt-0.5 text-gray-500">{sub}</p>
            </div>
            <div className="relative flex items-center justify-center py-3">
                <div className="rounded-xl px-6 py-3 bg-white/60 backdrop-blur-sm border border-white/40 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Latest</span>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                    <p className="cryo-display text-[34px] font-extrabold leading-none text-slate-900">
                        {reading}
                        <span className="text-[16px] font-bold text-slate-500"> {readingUnit}</span>
                    </p>
                </div>
            </div>
            {editable && (
                <div className="relative mt-auto">
                    <ThresholdBox kpiName={kpiName} draft={draft} ink={ink} onDraft={onDraft} currentReading={currentReading} />
                </div>
            )}
        </BentoCard>
    );
}

// ─── Grid ────────────────────────────────────────────────────────────────────

const CryoBentoGrid = forwardRef<CryoBentoGridHandle, {
    /** null renders the grid as an empty preview (no data fetch, no saving). */
    tankId: number | null;
    tankCode: string | null;
    isCryotank: boolean;
    otherTanks?: Array<{ tank_id: number; canisterId: string; branchName: string }>;
}>(function CryoBentoGrid({ tankId, tankCode, isCryotank, otherTanks = [] }, ref) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showCopyDropdown, setShowCopyDropdown] = useState(false);
    const [selectedCopyTankIds, setSelectedCopyTankIds] = useState<number[]>([]);
    const [savingCopy, setSavingCopy] = useState(false);
    const [live, setLive] = useState<LiveData>(EMPTY_LIVE);
    const [configRows, setConfigRows] = useState<KpiConfigRow[]>([]);
    const [baseline, setBaseline] = useState<Record<string, KpiDraft>>({});
    const [draft, setDraft] = useState<Record<string, KpiDraft>>({});
    // full_weight_kg − empty_weight_kg for the selected tank; scales the LN2 slider
    const [usableKg, setUsableKg] = useState<number | null>(null);

    const buildDrafts = (rows: KpiConfigRow[]): Record<string, KpiDraft> => {
        const next: Record<string, KpiDraft> = {};
        for (const k of EDITABLE_KPIS) {
            const row = rows.find((r) => r.kpi_name === k);
            next[k] = {
                min: row?.min ?? null,
                max: row?.max ?? null,
                enabled: row?.status ?? false,
                whatsapp_alert: row?.whatsapp_alert ?? false,
                email_alert: row?.email_alert ?? false,
                unack_escalation_threshold: row?.unack_escalation_threshold ?? null,
            };
        }
        return next;
    };

    const loadAll = (cancelledRef: { cancelled: boolean }) => {
        if (tankId == null || tankCode == null) return;
        setLoading(true);
        Promise.allSettled([
            ivfService.getQualityHistory(tankCode, 30),
            ivfService.getLn2HistoryById(tankId, 30),
            ivfService.getKpiHistory(tankId), // LIVE mode: latest N readings per KPI (no aggregation)
            ivfService.getKpiConfigList(tankId, "tank"),
        ]).then(([q, l, k_raw, c]) => {
            if (cancelledRef.cancelled) return;
            const next: LiveData = { ...EMPTY_LIVE };

            if (q.status === "fulfilled") {
                const hist = q.value.history ?? [];
                const series = hist
                    .map((h) => h.temp_internal)
                    .filter((v): v is number => v != null && Number.isFinite(v));
                const batteries = hist
                    .map((h) => h.battery_percentage)
                    .filter((v): v is number => v != null && Number.isFinite(v));
                const extTemps = hist
                    .map((h) => h.temp_external)
                    .filter((v): v is number => v != null && Number.isFinite(v));
                const shocks = hist
                    .map((h) => h.shock)
                    .filter((v): v is number => v != null && Number.isFinite(v));
                next.tempCurrent = series.length ? series[series.length - 1] : null;
                next.battery = batteries.length ? batteries[batteries.length - 1] : null;
                next.extTempCurrent = extTemps.length ? extTemps[extTemps.length - 1] : null;
                next.shockCurrent = shocks.length ? shocks[shocks.length - 1] : null;
            }

            if (l.status === "fulfilled") {
                const hist = l.value.history ?? [];
                const series = hist
                    .map((h) => h.ln2_level_pct ?? h.ln2_level)
                    .filter((v): v is number => v != null && Number.isFinite(v));
                const lastRow = hist[hist.length - 1];
                const mass = lastRow?.ln2_mass_kg;
                const evap = lastRow?.evaporation_rate_kg_per_h ?? lastRow?.ln2_evaporation_rate;
                next.ln2Pct = series.length ? Math.round(series[series.length - 1]) : null;
                next.evapCurrent = evap ?? null;
                next.refillDays =
                    mass != null && evap != null && evap > 0
                        ? Math.round(mass / evap / 24)
                        : null;
            }

            // Process raw readings (10M window) for latest values
            if (k_raw.status === "fulfilled") {
                const series_raw = k_raw.value.kpi_series ?? {};
                const lastVal = (name: string) => {
                    const arr = series_raw[name];
                    return arr && arr.length ? arr[arr.length - 1] : null;
                };

                // Fill missing KPI readings from raw kpi_series (latest raw value, not aggregated)
                const tempRow = lastVal("temp_internal");
                if (tempRow && next.tempCurrent == null) next.tempCurrent = tempRow.value;

                const extRow = lastVal("temp_external");
                if (extRow && next.extTempCurrent == null) next.extTempCurrent = extRow.value;

                const battRow = lastVal("tive_battery_percentage");
                if (battRow && next.battery == null) next.battery = battRow.value;

                const shockRow = lastVal("shock");
                if (shockRow && next.shockCurrent == null) next.shockCurrent = shockRow.value;

                const evapRow = lastVal("ln2_evaporation_rate");
                if (evapRow && next.evapCurrent == null) next.evapCurrent = evapRow.value;

                const lidRow = lastVal("ln2_lid_state") ?? lastVal("lid_state");
                if (lidRow) next.lidOpen = lidRow.value >= 1;
            }

            setLive(next);

            if (c.status === "fulfilled") {
                const rows = c.value.config ?? [];
                setConfigRows(rows);
                const drafts = buildDrafts(rows);
                setBaseline(drafts);
                setDraft(drafts);
                const empty = c.value.empty_weight_kg;
                const full = c.value.full_weight_kg;
                setUsableKg(
                    empty != null && full != null && full > empty
                        ? Math.round((full - empty) * 100) / 100
                        : null,
                );
            } else {
                setConfigRows([]);
                const drafts = buildDrafts([]);
                setBaseline(drafts);
                setDraft(drafts);
                setUsableKg(null);
            }
        }).finally(() => {
            if (!cancelledRef.cancelled) setLoading(false);
        });
    };

    useEffect(() => {
        setLive(EMPTY_LIVE);
        setConfigRows([]);
        setBaseline({});
        setDraft({});
        setUsableKg(null);
        if (!isCryotank || tankId == null) return;
        const ref = { cancelled: false };
        loadAll(ref);
        return () => {
            ref.cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tankId, tankCode, isCryotank]);

    const onDraft = (kpiName: string, patch: Partial<KpiDraft>) => {
        setDraft((prev) => ({
            ...prev,
            [kpiName]: { ...(prev[kpiName] ?? EMPTY_DRAFT), ...patch },
        }));
    };

    const dirtyKpis = useMemo(
        () => EDITABLE_KPIS.filter((k) => draft[k] && !sameDraft(draft[k], baseline[k])),
        [draft, baseline],
    );

    const handleDiscard = () => setDraft({ ...baseline });

    useImperativeHandle(ref, () => ({
        applyRecommended: () => {
            setDraft((prev) => {
                const next = { ...prev };
                for (const k of EDITABLE_KPIS) {
                    if (RECOMMENDED[k]) next[k] = { ...RECOMMENDED[k] };
                }
                // LN2 min scales per tank: 70% of usable capacity (full − empty weight)
                if (usableKg != null) {
                    next[KPI.LN2_LEVEL] = {
                        ...next[KPI.LN2_LEVEL],
                        min: Math.round(usableKg * 0.7 * 100) / 100,
                    };
                }
                return next;
            });
        },
    }), [usableKg]);

    const handleSave = async () => {
        if (tankId == null || dirtyKpis.length === 0 || saving) return;
        setSaving(true);
        try {
            const creates: Array<{
                kpi_name: string;
                alert_name: string | null;
                min: number | null;
                max: number | null;
                unit: string | null;
                alert_type: string | null;
                cooldown_minutes: number;
                unack_escalation_threshold: number | null;
                whatsapp_alert: boolean;
                email_alert: boolean;
                status: boolean;
            }> = [];
            for (const k of dirtyKpis) {
                const d = draft[k];
                const row = configRows.find((r) => r.kpi_name === k);
                // alert_type kept for engine severity: email-worthy alerts stay HIGH
                const alertType = d.enabled ? (d.email_alert ? "critical" : "soft") : null;
                const anyChannelOn = d.enabled && (d.whatsapp_alert || d.email_alert);
                const common = {
                    min: d.min,
                    max: d.max,
                    alert_type: alertType,
                    unack_escalation_threshold: anyChannelOn ? (d.unack_escalation_threshold ?? null) : null,
                    whatsapp_alert: d.enabled && d.whatsapp_alert,
                    email_alert: d.enabled && d.email_alert,
                    status: d.enabled,
                };
                if (row) {
                    await ivfService.updateKpiConfig(row.id, common);
                } else {
                    creates.push({
                        kpi_name: k,
                        alert_name: KPI_META[k].label,
                        unit: KPI_META[k].unit || null,
                        cooldown_minutes: 60,
                        ...common,
                    });
                }
            }
            if (creates.length > 0) {
                await ivfService.bulkUpsertKpiConfig([tankId], creates);
            }
            toast.success("Alert thresholds saved");
            const ref = { cancelled: false };
            loadAll(ref);
        } catch (e: any) {
            toast.error(e?.message || "Failed to save alert thresholds");
        } finally {
            setSaving(false);
        }
    };

    const handleCopyToTanks = async () => {
        if (selectedCopyTankIds.length === 0 || configRows.length === 0 || tankId == null) return;
        setSavingCopy(true);
        try {
            const configsToApply = configRows.map((cfg) => ({
                kpi_name: cfg.kpi_name,
                alert_name: cfg.alert_name ?? null,
                min: cfg.min ?? null,
                max: cfg.max ?? null,
                unit: cfg.unit ?? null,
                alert_type: cfg.alert_type ?? null,
                cooldown_minutes: cfg.cooldown_minutes,
                status: cfg.status,
            }));
            await ivfService.bulkUpsertKpiConfig(selectedCopyTankIds, configsToApply);
            toast.success(`Copied to ${selectedCopyTankIds.length} tank${selectedCopyTankIds.length !== 1 ? "s" : ""} successfully`);
        } catch (e: any) {
            toast.error(e?.message || "Failed to copy to tanks");
        } finally {
            setSavingCopy(false);
            setShowCopyDropdown(false);
            setSelectedCopyTankIds([]);
        }
    };

    const getDraft = (k: string): KpiDraft => draft[k] ?? EMPTY_DRAFT;
    const editable = isCryotank;

    // L2 line on the 3D tank follows the LN2 threshold slider live (kg → % of usable capacity)
    const ln2MinKg = getDraft(KPI.LN2_LEVEL).min;
    const ln2L2Pct =
        ln2MinKg != null && usableKg != null && usableKg > 0
            ? Math.min(100, Math.max(0, Math.round((ln2MinKg / usableKg) * 100)))
            : null;

    return (
        <>
            <style>{`
                @keyframes cryo-in {
                    from { opacity: 0; transform: translateY(14px) scale(0.985); }
                    to   { opacity: 1; transform: none; }
                }
                .cryo-in { opacity: 0; animation: cryo-in 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) forwards; }
                .cryo-display { font-family: 'Work Sans', sans-serif; }
                .cryo-range {
                    position: absolute; inset: 0; width: 100%; height: 100%; margin: 0;
                    -webkit-appearance: none; appearance: none; background: transparent;
                    pointer-events: none;
                }
                .cryo-range-solo { pointer-events: auto; }
                .cryo-range::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none; pointer-events: auto;
                    width: 18px; height: 18px; border-radius: 9999px;
                    background: #fff; border: 3px solid var(--thumb, #2E2A24);
                    box-shadow: 0 2px 6px rgba(0,0,0,0.25); cursor: grab;
                    transition: transform 0.15s ease;
                }
                .cryo-range::-webkit-slider-thumb:hover { transform: scale(1.12); }
                .cryo-range::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.2); }
                .cryo-range::-moz-range-thumb {
                    pointer-events: auto;
                    width: 18px; height: 18px; border-radius: 9999px;
                    background: #fff; border: 3px solid var(--thumb, #2E2A24);
                    box-shadow: 0 2px 6px rgba(0,0,0,0.25); cursor: grab;
                }
                @media (prefers-reduced-motion: reduce) {
                    .cryo-in { animation-duration: 0.01s; }
                }
            `}</style>

            {/* @container is required by the @2xl/@4xl/@min-[81rem] classes on the cards */}
            <div className="@container relative">
                {loading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                        <div className="flex items-center gap-3 rounded-2xl bg-white/85 px-6 py-4 shadow-xl" style={{ color: INK_SOFT }}>
                            <Loader2 className="animate-spin w-6 h-6" />
                            <p className="text-sm font-semibold">Loading live readings...</p>
                        </div>
                    </div>
                )}
                <div className={loading ? "blur-sm pointer-events-none select-none" : ""}>
                    {/* Card min-width rule: no bento card may render below 400px. Columns only
                        split when every card in the row stays >=400px (container padding + gap
                        included): 1-up by default, 2-up from @4xl, 3-up from @min-[81rem]. */}
                    <div className="grid grid-cols-12 gap-4 @2xl:gap-5">
                        {/* Heroes — live reading + threshold editing */}
                        <InternalTemperatureCard
                            tankCode={tankCode}
                            live={live}
                            draft={getDraft(KPI.TEMP_INTERNAL)}
                            editable={editable}
                            onDraft={onDraft}
                        />
                        <Ln2LevelCard
                            live={live}
                            draft={getDraft(KPI.LN2_LEVEL)}
                            editable={editable}
                            onDraft={onDraft}
                            usableKg={usableKg}
                            l2Pct={ln2L2Pct}
                        />
                        <LidStateCard
                            live={live}
                            draft={getDraft(KPI.LID_STATE)}
                            editable={editable}
                            onDraft={onDraft}
                        />

                        {/* Editable secondary KPIs */}
                        <EditableKpiCard
                            kpiName={KPI.TEMP_EXTERNAL}
                            title="External temperature:"
                            reading={live.extTempCurrent != null ? live.extTempCurrent.toFixed(1) : "—"}
                            readingUnit="°C"
                            sub="Room temperature around the tank"
                            gradient="bg-gradient-to-br from-[#DFF3DF] to-[#C6E7C6]"
                            ink="#2F6B4C"
                            deco={<ThermometerSun strokeWidth={1.25} className="absolute top-3 right-3 w-28 h-28 text-[#4E9A72] opacity-25" />}
                            delay={180}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 min-h-[350px]"
                            draft={getDraft(KPI.TEMP_EXTERNAL)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.extTempCurrent}
                        />
                        <EditableKpiCard
                            kpiName={KPI.LN2_EVAPORATION}
                            title="Evaporation rate:"
                            reading={live.evapCurrent != null ? live.evapCurrent.toFixed(2) : "—"}
                            readingUnit="kg/hr"
                            sub="How fast liquid nitrogen is being used up"
                            gradient="bg-gradient-to-br from-[#D5F0F1] to-[#BCE3E5]"
                            ink="#1E6B70"
                            deco={
                                // evap.svg is white-only art; mask + backgroundColor tints it like the other decos
                                <span
                                    aria-hidden
                                    className="absolute top-3 right-3 w-28 h-28 opacity-20"
                                    style={{
                                        backgroundColor: "#3E9AA0",
                                        WebkitMaskImage: "url(/evap.svg)",
                                        maskImage: "url(/evap.svg)",
                                        WebkitMaskRepeat: "no-repeat",
                                        maskRepeat: "no-repeat",
                                        WebkitMaskSize: "contain",
                                        maskSize: "contain",
                                        WebkitMaskPosition: "center",
                                        maskPosition: "center",
                                    }}
                                />
                            }
                            delay={220}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 min-h-[350px]"
                            draft={getDraft(KPI.LN2_EVAPORATION)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.evapCurrent}
                        />
                        <EditableKpiCard
                            kpiName={KPI.HUMIDITY}
                            title="Humidity:"
                            reading="—"
                            readingUnit="%"
                            sub="Moisture level in the air around the tank"
                            gradient="bg-gradient-to-br from-[#E1DEFA] to-[#CCC7F2]"
                            ink="#5B3E97"
                            deco={<CloudRain strokeWidth={1.25} className="absolute top-3 right-3 w-28 h-28 text-[#8B67C9] opacity-20" />}
                            delay={260}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 min-h-[350px]"
                            draft={getDraft(KPI.HUMIDITY)}
                            editable={editable}
                            onDraft={onDraft}
                        />
                        <EditableKpiCard
                            kpiName={KPI.BATTERY}
                            title="Battery:"
                            reading={live.battery != null ? String(Math.round(live.battery)) : "—"}
                            readingUnit="%"
                            sub="Charge left in the monitoring device battery"
                            gradient="bg-gradient-to-br from-[#F7D4F0] to-[#EFB6E4]"
                            ink="#8A1F72"
                            deco={<Battery strokeWidth={1.25} className="absolute top-3 right-3 w-28 h-28 text-[#C554AC] opacity-25" />}
                            delay={300}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 min-h-[350px]"
                            draft={getDraft(KPI.BATTERY)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.battery}
                        />
                        <EditableKpiCard
                            kpiName={KPI.SHOCK}
                            title="Shock detection:"
                            reading={live.shockCurrent != null ? live.shockCurrent.toFixed(1) : "—"}
                            readingUnit="g"
                            sub="Impacts or sudden movement of the tank"
                            gradient="bg-gradient-to-br from-[#C9E4EE] to-[#B2D7E5]"
                            ink="#1F6178"
                            deco={<Zap strokeWidth={1.25} className="absolute top-3 right-3 w-28 h-28 text-[#3E8CA8] opacity-20" />}
                            delay={340}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 min-h-[350px]"
                            draft={getDraft(KPI.SHOCK)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.shockCurrent}
                        />
                    </div>

                    {/* Sticky save bar */}
                    {editable && tankId != null && dirtyKpis.length > 0 && (
                        <div className="sticky bottom-2 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#2E2A24] text-white px-5 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.35)]">
                            <span className="text-sm font-semibold">
                                {dirtyKpis.length} unsaved threshold change{dirtyKpis.length > 1 ? "s" : ""}
                            </span>
                            <div className="flex items-center gap-2">
                                {/* Copy to Additional Tanks */}
                                {otherTanks.length > 0 && configRows.length > 0 && (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowCopyDropdown((v) => !v)}
                                            disabled={savingCopy}
                                            className="px-4 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-150 disabled:opacity-50"
                                        >
                                            Copy to Other Tanks
                                        </button>
                                        {showCopyDropdown && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setShowCopyDropdown(false)} />
                                                <div className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                                                        <span className="text-xs text-gray-500">{otherTanks.length} tank{otherTanks.length !== 1 ? "s" : ""}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setSelectedCopyTankIds(
                                                                    otherTanks.every((c) => selectedCopyTankIds.includes(c.tank_id))
                                                                        ? selectedCopyTankIds.filter((id) => !otherTanks.some((c) => c.tank_id === id))
                                                                        : [...new Set([...selectedCopyTankIds, ...otherTanks.map((c) => c.tank_id)])]
                                                                )
                                                            }
                                                            className="text-xs text-primary font-medium hover:underline"
                                                        >
                                                            {otherTanks.every((c) => selectedCopyTankIds.includes(c.tank_id)) && otherTanks.length > 0 ? "Deselect All" : "Select All"}
                                                        </button>
                                                    </div>
                                                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-50" style={{ scrollbarWidth: "thin" }}>
                                                        {otherTanks.length === 0 && (
                                                            <div className="px-4 py-3 text-xs text-gray-400">No other tanks available.</div>
                                                        )}
                                                        {otherTanks.map((c) => (
                                                            <label key={c.tank_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedCopyTankIds.includes(c.tank_id)}
                                                                    onChange={() =>
                                                                        setSelectedCopyTankIds((prev) =>
                                                                            prev.includes(c.tank_id)
                                                                                ? prev.filter((id) => id !== c.tank_id)
                                                                                : [...prev, c.tank_id]
                                                                        )
                                                                    }
                                                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                                />
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-semibold text-gray-900 truncate">Tank {c.canisterId}</div>
                                                                    <div className="text-xs text-gray-500 truncate">{c.branchName}</div>
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                                                        <button
                                                            type="button"
                                                            disabled={selectedCopyTankIds.length === 0 || savingCopy}
                                                            onClick={handleCopyToTanks}
                                                            className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                                        >
                                                            {savingCopy ? (
                                                                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</>
                                                            ) : (
                                                                <>Apply to {selectedCopyTankIds.length} Tank{selectedCopyTankIds.length !== 1 ? "s" : ""}</>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={handleDiscard}
                                    disabled={saving}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-150 disabled:opacity-50"
                                >
                                    Discard
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 rounded-xl bg-white text-[#2E2A24] text-sm font-bold hover:bg-white/90 transition-colors duration-150 disabled:opacity-60 flex items-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="animate-spin w-4 h-4" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save Changes"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
});

export default CryoBentoGrid;
