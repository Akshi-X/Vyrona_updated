import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useState } from "react";
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

export interface KpiSliderMeta {
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
    [KPI.LN2_LEVEL]: { label: "LN2", unit: "Ln2 in kg", lo: 0, hi: 100, step: 0.1, dual: false },
    [KPI.LN2_EVAPORATION]: { label: "Evaporation Rate", unit: "kg/hr", lo: -0.5, hi: 1.5, step: 0.05, dual: true },
    [KPI.SHOCK]: { label: "Shock Detection", unit: "g", lo: 0, hi: 10, step: 0.1, dual: true },
    [KPI.BATTERY]: { label: "Battery Level", unit: "%", lo: 0, hi: 100, step: 1, dual: false },
    [KPI.HUMIDITY]: { label: "Humidity", unit: "%", lo: 0, hi: 100, step: 1, dual: true },
    [KPI.LID_STATE]: { label: "Lid State", unit: "", lo: 0, hi: 1, step: 1, dual: false },
};

const EDITABLE_KPIS = Object.keys(KPI_META);

export interface KpiDraft {
    min: number | null;
    max: number | null;
    /** Master alert switch for this KPI. */
    enabled: boolean;
    whatsapp_alert: boolean;
    email_alert: boolean;
    /** Needs an active channel: escalate to admins after N consecutive unacknowledged alerts (0 = immediate, null = disabled). */
    unack_escalation_threshold?: number | null;
    /** Minimum minutes between repeated alerts for this KPI. Defaults to 60. */
    cooldown_minutes?: number | null;
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

export const EMPTY_DRAFT: KpiDraft = {
    min: null,
    max: null,
    enabled: false,
    whatsapp_alert: false,
    email_alert: false,
    unack_escalation_threshold: null,
    cooldown_minutes: 60,
};

/**
 * Locks the alert controls while no device is selected (they still render, but
 * must not respond to input). `noun` is the device phrase used in the "Select …"
 * tooltip, e.g. "a cryotank" / "an incubator" / "a refrigerator".
 */
export interface LockState {
    locked: boolean;
    noun: string;
}
export const LockedContext = createContext<LockState>({ locked: false, noun: "a device" });

/**
 * Per-device policy consumed by the shared threshold controls. Defaults to the
 * cryotank values so CryoBentoGrid needs no provider; other device grids
 * (incubator/refrigerator) wrap their tree in a KpiPolicyContext.Provider.
 */
export interface KpiPolicy {
    /** kpiName → slider metadata (bounds, step, unit, dual). */
    metaMap: Record<string, KpiSliderMeta>;
    /** KPIs whose channels default ON the first time the master switch is enabled. */
    defaultChannelsOn: Set<string>;
    /** Lid-state KPI whose min/max lock to 0,0 on enable (binary alert). */
    lidStateKpi: string | null;
}

export const KpiPolicyContext = createContext<KpiPolicy>({
    metaMap: KPI_META,
    defaultChannelsOn: DEFAULT_CHANNELS_ON,
    lidStateKpi: KPI.LID_STATE,
});

/** Patch applied when the master switch turns on: core KPIs get both channels by default. */
const enablePatch = (policy: KpiPolicy, kpiName: string, d: KpiDraft): Partial<KpiDraft> => ({
    enabled: true,
    ...(policy.defaultChannelsOn.has(kpiName) && !d.whatsapp_alert && !d.email_alert
        ? { whatsapp_alert: true, email_alert: true }
        : {}),
    ...(kpiName === policy.lidStateKpi ? { min: 0, max: 0 } : {}),
});

export const sameDraft = (a?: KpiDraft, b?: KpiDraft) =>
    (a?.min ?? null) === (b?.min ?? null) &&
    (a?.max ?? null) === (b?.max ?? null) &&
    (a?.enabled ?? false) === (b?.enabled ?? false) &&
    (a?.whatsapp_alert ?? false) === (b?.whatsapp_alert ?? false) &&
    (a?.email_alert ?? false) === (b?.email_alert ?? false) &&
    (a?.unack_escalation_threshold ?? null) === (b?.unack_escalation_threshold ?? null) &&
    (a?.cooldown_minutes ?? 60) === (b?.cooldown_minutes ?? 60);

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

/** Shared keyframes + range-input styling for all bento grids. Global, injected once per grid. */
export function BentoStyles() {
    return (
        <style>{`
            @keyframes cryo-in {
                from { opacity: 0; transform: translateY(14px) scale(0.985); }
                to   { opacity: 1; transform: none; }
            }
            .cryo-in { opacity: 0; animation: cryo-in 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) forwards; }
            @keyframes cooldown-fade {
                from { opacity: 0; transform: translateY(2px); }
                to   { opacity: 1; transform: none; }
            }
            .cooldown-fade { animation: cooldown-fade 0.3s ease forwards; }
            .cryo-display { font-family: 'Work Sans', sans-serif; }
            .cryo-range {
                position: absolute; inset: 0; width: 100%; height: 100%; margin: 0;
                -webkit-appearance: none; appearance: none; background: transparent;
                pointer-events: none;
            }
            .cryo-range-solo { pointer-events: auto; }
            .cryo-range::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none; pointer-events: auto;
                width: 16px; height: 16px; border-radius: 9999px;
                background: #fff; border: 3px solid var(--thumb, #2E2A24);
                box-shadow: 0 2px 6px rgba(0,0,0,0.25); cursor: grab;
                transition: transform 0.15s ease;
            }
            .cryo-range::-webkit-slider-thumb:hover { transform: scale(1.12); }
            .cryo-range::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.2); }
            .cryo-range:disabled::-webkit-slider-thumb {
                cursor: not-allowed; border-color: #9CA3AF; transform: none;
            }
            .cryo-range::-moz-range-thumb {
                pointer-events: auto;
                width: 16px; height: 16px; border-radius: 9999px;
                background: #fff; border: 3px solid var(--thumb, #2E2A24);
                box-shadow: 0 2px 6px rgba(0,0,0,0.25); cursor: grab;
            }
            .cryo-range:disabled::-moz-range-thumb { cursor: not-allowed; border-color: #9CA3AF; }
            @media (prefers-reduced-motion: reduce) {
                .cryo-in { animation-duration: 0.01s; }
            }
        `}</style>
    );
}

export function BentoCard({
    className = "",
    children,
    delay = 0,
    id,
}: {
    className?: string;
    children: ReactNode;
    delay?: number;
    /** Onboarding tour anchor, e.g. "onboarding-alert-kpi-temp_internal". */
    id?: string;
}) {
    return (
        <div
            id={id}
            className={`cryo-in relative md:overflow-hidden rounded-none md:rounded-[20px] border-0 md:border md:border-gray-100 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
            style={{ animationDelay: `${delay}ms`, color: INK } as CSSProperties}
        >
            {children}
        </div>
    );
}

export function CardTitle({ children }: { children: ReactNode }) {
    return <h3 className="text-[15px] font-extrabold tracking-tight text-gray-900">{children}</h3>;
}

export function MicroLabel({ children }: { children: ReactNode }) {
    return (
        <span className="block leading-none text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500">
            {children}
        </span>
    );
}

const LOADING_MESSAGES = [
    "Fetching configuration...",
    "Loading live readings...",
    "Syncing alert thresholds...",
];

/** Typewriter loop through LOADING_MESSAGES: types, holds, deletes, moves to next. */
export function LoadingMessage() {
    const [msgIndex, setMsgIndex] = useState(0);
    const [text, setText] = useState("");
    const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");

    useEffect(() => {
        const full = LOADING_MESSAGES[msgIndex];
        if (phase === "typing") {
            if (text.length < full.length) {
                const id = setTimeout(() => setText(full.slice(0, text.length + 1)), 32);
                return () => clearTimeout(id);
            }
            const id = setTimeout(() => setPhase("holding"), 900);
            return () => clearTimeout(id);
        }
        if (phase === "holding") {
            const id = setTimeout(() => setPhase("deleting"), 700);
            return () => clearTimeout(id);
        }
        // deleting
        if (text.length > 0) {
            const id = setTimeout(() => setText(text.slice(0, -1)), 18);
            return () => clearTimeout(id);
        }
        setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
        setPhase("typing");
    }, [text, phase, msgIndex]);

    return (
        <p className="text-sm font-semibold min-w-[13ch]">
            {text}
            <span className="inline-block w-[2px] h-[1em] align-middle ml-0.5 bg-current animate-pulse" />
        </p>
    );
}

// ─── Threshold editing controls ──────────────────────────────────────────────

const COOLDOWN_MESSAGES = [
    "No repeat WhatsApp alert for 1 hr.",
    "Admins get no repeat WhatsApp alert for 2 hr.",
];
const COOLDOWN_ROTATE_MS = 10000;

/** Bottom control bar: bell status, WhatsApp / email channel buttons, master switch. */
export function ChannelBar({
    kpiName,
    draft,
    onDraft,
}: {
    kpiName: string;
    draft: KpiDraft;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    const { locked, noun: lockNoun } = useContext(LockedContext);
    const policy = useContext(KpiPolicyContext);
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

    // Whenever WhatsApp is active, the status pill rotates through the base status
    // and the two cooldown tips every 10s; the ring around the bell tracks the sweep.
    const rotating = on && draft.whatsapp_alert;
    const messages = rotating ? [statusText, ...COOLDOWN_MESSAGES] : [statusText];
    const [index, setIndex] = useState(0);
    useEffect(() => {
        if (!rotating) {
            setIndex(0);
            return;
        }
        const id = setInterval(() => {
            setIndex((i) => (i + 1) % messages.length);
        }, COOLDOWN_ROTATE_MS);
        return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rotating]);
    const displayText = messages[index % messages.length];

    return (
        <>
        <div className="mt-1.5 flex flex-col items-stretch @min-[30rem]:flex-row @min-[30rem]:items-center gap-1.5">
            <div
                className={`relative flex-1 min-w-0 flex items-center gap-2 rounded-full px-2 py-1 transition-colors duration-200 border ${
                    on ? "bg-primary-ring/60 border-primary-ring" : "bg-primary-bg/80 border-primary-ring"
                }`}
            >
                <div
                    className={`relative w-9 h-9 rounded-full grid place-items-center shrink-0 transition-colors duration-200 ${
                        on ? "bg-primary-light" : "bg-gray-200"
                    }`}
                >
                    {on ? (
                        <Bell size={15} className="text-white" />
                    ) : (
                        <BellOff size={15} className="text-gray-500" />
                    )}
                </div>
                <p key={index} className="flex-1 min-w-0 px-1 text-[11px] leading-tight font-semibold text-gray-800 cooldown-fade">
                    {displayText}
                </p>
            </div>
            <div
                className={`relative shrink-0 flex items-center justify-between @min-[30rem]:justify-start gap-2 rounded-full px-2 py-1 transition-colors duration-200 border ${
                    on ? "bg-primary-ring/60 border-primary-ring" : "bg-primary-bg/80 border-primary-ring"
                }`}
            >
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-pressed={on && draft.whatsapp_alert}
                        id={`onboarding-alert-whatsapp-${kpiName}`}
                        aria-label="WhatsApp alerts"
                        title={locked ? `Select ${lockNoun} first` : on ? "WhatsApp alerts" : "Turn the alert on first"}
                        disabled={!on || locked}
                        onClick={() =>
                            onDraft(kpiName, {
                                whatsapp_alert: !draft.whatsapp_alert,
                            })
                        }
                        className="relative w-9 h-9 rounded-full bg-white border border-gray-200 grid place-items-center shrink-0 transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/40"
                    >
                        <img
                            src="/250px-WhatsApp.svg.webp"
                            alt=""
                            className={`w-[18px] h-[18px] transition-all duration-200 ${on && draft.whatsapp_alert ? "" : "grayscale opacity-40"}`}
                        />
                        {on && draft.whatsapp_alert && (
                            <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-green-400 border-2 border-white" />
                        )}
                    </button>
                    <button
                        type="button"
                        aria-pressed={on && draft.email_alert}
                        id={`onboarding-alert-email-${kpiName}`}
                        aria-label="Email alerts"
                        title={locked ? `Select ${lockNoun} first` : on ? "Email alerts" : "Turn the alert on first"}
                        disabled={!on || locked}
                        onClick={() =>
                            onDraft(kpiName, {
                                email_alert: !draft.email_alert,
                                // Escalation is email-only; clear it when email turns off
                                ...(draft.email_alert && { unack_escalation_threshold: null }),
                            })
                        }
                        className="relative w-9 h-9 rounded-full bg-white border border-gray-200 grid place-items-center shrink-0 transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/40"
                    >
                        <Mail size={15} className={`transition-colors duration-200 ${on && draft.email_alert ? "text-[#6b1176]" : "text-gray-300"}`} />
                        {on && draft.email_alert && (
                            <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-green-400 border-2 border-white" />
                        )}
                    </button>
                </div>
                <div className="relative group shrink-0 flex items-center">
                    {locked && (
                        <div className="pointer-events-none absolute -top-1 right-0 -translate-y-full w-max max-w-[180px] rounded-lg bg-black text-white text-[10px] font-medium px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30 text-center">
                            Select {lockNoun} to enable
                        </div>
                    )}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        id={`onboarding-alert-toggle-${kpiName}`}
                        aria-label="Alert on/off"
                        disabled={locked}
                        onClick={() =>
                            onDraft(
                                kpiName,
                                on
                                    ? { enabled: false, unack_escalation_threshold: null }
                                    : enablePatch(policy, kpiName, draft),
                            )
                        }
                        className={`relative w-12 h-7 rounded-full shrink-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/40 disabled:cursor-not-allowed disabled:opacity-60 ${
                            on ? "bg-primary-light" : "bg-gray-300"
                        }`}
                    >
                        <span
                            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                                on ? "translate-x-5" : "translate-x-0"
                            }`}
                        />
                    </button>
                </div>
            </div>
        </div>
        </>
    );
}

/**
 * Formats a value at a KPI's step precision. With `trim` (tick labels, live-reading
 * markers) it rounds and strips trailing zeros for compact display, e.g. "2.5".
 * Without it (Min/Max inputs) it preserves the fixed decimal padding the user is
 * editing against, e.g. "50.0", so the field doesn't reformat mid-typing.
 */
export const formatStep = (v: number, step: number, trim = false): string => {
    if (Number.isInteger(step)) return trim ? String(Math.round(v)) : String(v);
    const fixed = v.toFixed(step < 0.1 ? 2 : 1);
    return trim ? String(Number(fixed)) : fixed;
};

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
    const fmt = (v: number) => formatStep(v, step);
    const [text, setText] = useState(value != null ? fmt(value) : "");
    useEffect(() => {
        setText(value != null ? fmt(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    const commit = () => {
        if (text.trim() === "") {
            onCommit(null);
            return;
        }
        const n = Number(text);
        if (!Number.isFinite(n)) {
            setText(value != null ? fmt(value) : "");
            return;
        }
        onCommit(Math.min(hi, Math.max(lo, n)));
    };
    return (
        <label className="flex items-center gap-1">
            <span className="text-[12px] font-bold text-gray-700">{label}</span>
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
                className="w-16 rounded-md bg-white border border-gray-200 px-1.5 py-1 text-[13px] font-bold text-center outline-none focus:ring-2 focus:ring-black/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {unit && <span className="text-[12px] font-bold text-gray-700">{unit}</span>}
        </label>
    );
}

function KpiSlider({
    meta,
    draft,
    ink,
    onChange,
    currentReading,
    markerUnit,
}: {
    meta: KpiSliderMeta;
    draft: KpiDraft;
    ink: string;
    onChange: (min: number | null, max: number | null) => void;
    currentReading?: number | null;
    markerUnit?: string;
}) {
    const { locked, noun: lockNoun } = useContext(LockedContext);
    const unit = markerUnit ?? meta.unit;
    const a = draft.min ?? meta.lo;
    const b = draft.max ?? meta.hi;
    const pct = (v: number) => ((v - meta.lo) / (meta.hi - meta.lo)) * 100;
    const fmt = (v: number) => formatStep(v, meta.step, true);
    const scaleTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => meta.lo + t * (meta.hi - meta.lo));

    // The pointer tick tracks the reading, clamped to the scale so an out-of-range
    // value pins to the edge instead of sliding off the track; the label shifts
    // toward the interior near the edges so it never overflows the card.
    const readingPct = Math.min(100, Math.max(0, pct(currentReading ?? meta.lo)));
    const labelTransform =
        readingPct >= 88 ? "translateX(-100%)" : readingPct <= 12 ? "translateX(0)" : "translateX(-50%)";

    return (
        <div style={{ "--thumb": ink } as CSSProperties}>
            <div className="relative select-none">
                <div className="relative h-6">
                    <div
                        className={`absolute inset-y-0 pointer-events-none ${currentReading == null ? "invisible" : ""}`}
                        style={{ left: `${readingPct}%` }}
                    >
                        <span
                            className="absolute top-0 text-[10px] font-bold text-green-600 whitespace-nowrap leading-none"
                            style={{ transform: labelTransform }}
                        >
                            Latest {currentReading != null ? fmt(currentReading) : ""}{unit ? ` ${unit}` : ""}
                        </span>
                        <div className="absolute bottom-0 -translate-x-1/2 w-0.5 h-2 bg-green-500 rounded-full opacity-80" />
                    </div>
                </div>
                <div className="relative h-6 group">
                    {locked && (
                        <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full w-max max-w-[180px] rounded-lg bg-black text-white text-[10px] font-medium px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30 text-center">
                            Select {lockNoun} to enable
                        </div>
                    )}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-white" />
                    <div
                        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full transition-all duration-150"
                        style={{
                            left: `${meta.dual ? pct(Math.min(a, b)) : 0}%`,
                            right: `${100 - pct(meta.dual ? Math.max(a, b) : a)}%`,
                            backgroundColor: locked ? "#9CA3AF" : ink,
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
                                disabled={locked}
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
                                disabled={locked}
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
                            disabled={locked}
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
                        className={`flex flex-col text-[11px] font-semibold leading-tight text-gray-600 ${
                            i === 0 ? "items-start" : i === scaleTicks.length - 1 ? "items-end" : "items-center"
                        }`}
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
        <div id={`onboarding-alert-escalation-${kpiName}`} className="relative h-9 flex items-center justify-between gap-2 mt-1.5 px-3 rounded-xl bg-orange-50 border border-orange-100">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-orange-800">Mail Escalation</span>
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
                    className="w-12 rounded-md bg-white border border-orange-200 px-1.5 py-1 text-[13px] font-bold text-orange-900 text-center outline-none focus:ring-2 focus:ring-orange-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[11px] font-semibold text-orange-700 whitespace-nowrap">
                    {v === null ? "no escalation set" : v === 0 ? "immediate" : `after ${v} unack`}
                </span>
            </div>
        </div>
    );
}

function EscalationHint({ message, dim = false, id }: { message: string; dim?: boolean; id?: string }) {
    return (
        <div
            id={id}
            className={`relative mt-1.5 px-3 py-2 @min-[25.625rem]:h-9 @min-[25.625rem]:py-0 rounded-xl border border-dashed flex items-center gap-2 ${
                dim ? "bg-gray-100 border-gray-200" : "bg-primary-bg/60 border-primary-ring"
            }`}
        >
            <span
                className={`text-[11px] font-bold uppercase tracking-[0.1em] leading-tight max-w-[38px] @min-[25.625rem]:max-w-none ${
                    dim ? "text-gray-400" : "text-gray-500"
                }`}
            >
                Mail Escalation
            </span>
            <p className={`text-[11px] font-semibold flex-1 text-right ${dim ? "text-gray-400" : "text-gray-500"}`}>
                {message}
            </p>
        </div>
    );
}

/** Cooldown between repeated alerts. Always visible; editable only when the alert is enabled. */
function CooldownRow({
    kpiName,
    draft,
    onDraft,
}: {
    kpiName: string;
    draft: KpiDraft;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    const dim = !draft.enabled;
    const v = draft.cooldown_minutes ?? 60;
    return (
        <div
            className={`relative h-9 flex items-center justify-between gap-2 mt-1.5 px-3 rounded-xl ${
                dim ? "bg-gray-100" : "bg-primary-bg/60"
            }`}
        >
            <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${dim ? "text-gray-400" : "text-primary"}`}>
                Mail Cooldown
            </span>
            <div className="flex items-center gap-1.5">
                <input
                    type="number"
                    min={0}
                    step={5}
                    disabled={dim}
                    value={v}
                    onChange={(e) => {
                        const raw = e.target.value;
                        onDraft(kpiName, {
                            cooldown_minutes: raw === "" ? 60 : Math.max(0, Math.round(Number(raw))),
                        });
                    }}
                    title="Minimum minutes between repeated alerts for this KPI."
                    className="w-12 rounded-md bg-white border border-primary-ring px-1.5 py-1 text-[13px] font-bold text-primary text-center outline-none focus:ring-2 focus:ring-primary-ring disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className={`text-[11px] font-semibold whitespace-nowrap ${dim ? "text-gray-400" : "text-gray-500"}`}>
                    min between alerts
                </span>
            </div>
        </div>
    );
}

/** Escalation row is always visible: input when usable, otherwise a hint on how to unlock it. Cooldown always follows it. */
export function EscalationRow({
    kpiName,
    draft,
    onDraft,
}: {
    kpiName: string;
    draft: KpiDraft;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
}) {
    return (
        <>
            {draft.enabled && draft.email_alert ? (
                <EscalationInput kpiName={kpiName} draft={draft} onDraft={onDraft} />
            ) : (
                <EscalationHint
                    id={`onboarding-alert-escalation-${kpiName}`}
                    dim={!draft.enabled}
                    message={
                        draft.enabled
                            ? "Turn on email alerts to enable escalation"
                            : "Turn on the alert with email to enable"
                    }
                />
            )}
            <CooldownRow kpiName={kpiName} draft={draft} onDraft={onDraft} />
        </>
    );
}

export function ThresholdBox({
    kpiName,
    draft,
    ink,
    onDraft,
    metaOverride,
    currentReading,
    markerUnit,
}: {
    kpiName: string;
    draft: KpiDraft;
    ink: string;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
    metaOverride?: Partial<KpiSliderMeta>;
    currentReading?: number | null;
    markerUnit?: string;
}) {
    const policy = useContext(KpiPolicyContext);
    const meta = { ...policy.metaMap[kpiName], ...metaOverride };
    const dim = !draft.enabled;
    return (
        <>
            <div className={`relative rounded-xl border px-2.5 py-2.5 ${dim ? "bg-gray-100 border-gray-200" : "bg-primary-bg/60 border-primary-ring"}`}>
                <div className="mb-1">
                    <MicroLabel>Alert threshold</MicroLabel>
                </div>
                <KpiSlider
                    meta={meta}
                    draft={draft}
                    ink={dim ? "#9CA3AF" : ink}
                    onChange={(min, max) =>
                        onDraft(kpiName, {
                            min,
                            max,
                            // Dragging a slider implies the alert should be live
                            ...(draft.enabled ? {} : enablePatch(policy, kpiName, draft)),
                        })
                    }
                    currentReading={currentReading}
                    markerUnit={markerUnit}
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
        <BentoCard delay={0} id={`onboarding-alert-kpi-${KPI.TEMP_INTERNAL}`} className="col-span-12 @min-[70rem]:col-span-5 md:min-h-[402px] pt-4 px-0 pb-4 md:p-4 flex flex-col gap-2">
            <Thermometer strokeWidth={1.25} className="absolute top-4 right-4 w-24 h-24 text-[#6B3A7E] opacity-[0.12]" />
            <div className="relative">
                <CardTitle>Internal temperature:</CardTitle>
                <p className="text-[12px] mt-0.5 text-gray-500">Cryogenic temperature inside {tankCode ? `tank ${tankCode}` : "the tank"}, where samples are stored</p>
            </div>
            {editable && (
                <div className="relative md:mt-auto">
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
        <BentoCard delay={60} id={`onboarding-alert-kpi-${KPI.LN2_LEVEL}`} className="col-span-12 @min-[70rem]:col-span-7 md:min-h-[402px] pt-4 px-0 pb-4 md:p-4 flex flex-row gap-4">
            <div className="relative flex-1 min-w-0 flex flex-col items-start gap-2">
                <div className="relative">
                    <CardTitle>LN2 level:</CardTitle>
                    <p className="text-[12px] mt-0.5 text-gray-500">Liquid nitrogen left in the tank to keep samples frozen</p>
                </div>
                {editable && (
                    <div className="relative md:mt-auto self-stretch min-[500px]:min-w-[320px]">
                        <ThresholdBox
                            kpiName={KPI.LN2_LEVEL}
                            draft={draft}
                            ink="#6B3A7E"
                            onDraft={onDraft}
                            metaOverride={usableKg != null ? { hi: usableKg } : undefined}
                            currentReading={usableKg != null && live.ln2Pct != null ? (live.ln2Pct / 100) * usableKg : null}
                            markerUnit="kg"
                        />
                    </div>
                )}
            </div>
            {/* Below 1030px there's no room for the 3D dewar — show a watermark icon instead, positioned like the other cards' decos */}
            <span
                aria-hidden
                className="@min-[1030px]:hidden absolute top-4 right-4 w-24 h-24 opacity-[0.12]"
                style={{
                    backgroundColor: "#6B3A7E",
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
            <div className="relative w-[260px] shrink-0 min-h-0 hidden @min-[1030px]:flex flex-col pt-10">
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
        <BentoCard delay={120} id={`onboarding-alert-kpi-${KPI.LID_STATE}`} className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 md:min-h-[402px] pt-4 px-0 pb-4 md:p-4 flex flex-col gap-2">
            {/* lid_state.svg is white-only art; mask + backgroundColor tints it like the other decos */}
            <span
                aria-hidden
                className="absolute top-4 right-4 w-20 h-20 opacity-[0.12]"
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
            {editable && (
                <div className="relative md:mt-auto">
                    <div className="rounded-xl bg-primary-bg/60 border border-primary-ring px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2.5">
                                <span className="block leading-none text-[11px] font-bold uppercase tracking-[0.1em] text-gray-900">
                                    Alert threshold
                                </span>
                                <p className="text-[12px] leading-none font-semibold text-gray-700">
                                    Alerts when the lid is opened.
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-white border border-gray-200 px-3 py-2">
                                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-green-600 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    Latest
                                </span>
                                <span className={`text-[15px] font-bold leading-none whitespace-nowrap ${known ? (open ? "text-amber-600" : "text-green-600") : "text-slate-400"}`}>
                                    {known ? (open ? "OPEN" : "CLOSED") : "—"}
                                </span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-primary-ring/70">
                            <span className="block leading-none text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500 mb-1.5">
                                Guidelines
                            </span>
                            <ul className="space-y-1">
                                <li className="flex items-start gap-1.5 text-[11px] font-medium text-gray-600">
                                    <span className="mt-1 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                                    Do not overfill the tank to the brim.
                                </li>
                                <li className="flex items-start gap-1.5 text-[11px] font-medium text-gray-600">
                                    <span className="mt-1 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                                    Once filled, check the lid status before closing.
                                </li>
                            </ul>
                        </div>
                    </div>
                    <EscalationRow kpiName={KPI.LID_STATE} draft={draft} onDraft={onDraft} />
                    <ChannelBar kpiName={KPI.LID_STATE} draft={draft} onDraft={onDraft} />
                </div>
            )}
        </BentoCard>
    );
}

// ─── Editable secondary cards ────────────────────────────────────────────────

export function EditableKpiCard({
    kpiName,
    title,
    sub,
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
    sub: string;
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
        <BentoCard delay={delay} id={`onboarding-alert-kpi-${kpiName}`} className={`${className} pt-4 px-0 pb-4 md:p-4 flex flex-col gap-2`}>
            {deco}
            <div className="relative">
                <CardTitle>{title}</CardTitle>
                <p className="text-[12px] mt-0.5 text-gray-500">{sub}</p>
            </div>
            {editable && (
                <div className="relative md:mt-auto">
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
                cooldown_minutes: row?.cooldown_minutes ?? 60,
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
                    cooldown_minutes: d.cooldown_minutes ?? 60,
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
        <LockedContext.Provider value={{ locked: tankId == null, noun: "a cryotank" }}>
            <BentoStyles />

            {/* @container is required by the @2xl/@4xl/@min-[81rem] classes on the cards */}
            <div className="@container relative flex-1 min-h-0 flex flex-col md:rounded-[24px] md:p-3 @2xl:p-4 md:bg-gradient-to-b md:from-primary-bg md:to-[#FAFAFA] md:overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                        <div className="flex items-center gap-3 rounded-2xl bg-white/85 px-6 py-4 shadow-xl" style={{ color: INK_SOFT }}>
                            <Loader2 className="animate-spin w-6 h-6" />
                            <LoadingMessage />
                        </div>
                    </div>
                )}
                {/* Scrollable card area — the save bar below stays outside this scroll region, always visible */}
                <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <div className={loading ? "blur-sm pointer-events-none select-none" : ""}>
                    {/* Card min-width rule: no bento card may render below 400px. Columns only
                        split when every card in the row stays >=400px (container padding + gap
                        included): 1-up by default, 2-up from @4xl, 3-up from @min-[81rem]. */}
                    <div className="grid grid-cols-12 gap-3 @2xl:gap-4 max-md:[&>*:not(:first-child)]:border-t max-md:[&>*:not(:first-child)]:border-gray-200">
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
                            sub="Room temperature around the tank"
                            ink="#6B3A7E"
                            deco={<ThermometerSun strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#2F6B4C] opacity-[0.12]" />}
                            delay={180}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 md:min-h-[402px]"
                            draft={getDraft(KPI.TEMP_EXTERNAL)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.extTempCurrent}
                        />
                        <EditableKpiCard
                            kpiName={KPI.LN2_EVAPORATION}
                            title="Evaporation rate:"
                            sub="How fast liquid nitrogen is being used up"
                            ink="#6B3A7E"
                            deco={
                                // evap.svg is white-only art; mask + backgroundColor tints it like the other decos
                                <span
                                    aria-hidden
                                    className="absolute top-3 right-3 w-20 h-20 opacity-[0.12]"
                                    style={{
                                        backgroundColor: "#1E6B70",
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
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 md:min-h-[402px]"
                            draft={getDraft(KPI.LN2_EVAPORATION)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.evapCurrent}
                        />
                        <EditableKpiCard
                            kpiName={KPI.HUMIDITY}
                            title="Humidity:"
                            sub="Moisture level in the air around the tank"
                            ink="#6B3A7E"
                            deco={<CloudRain strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#5B3E97] opacity-[0.12]" />}
                            delay={260}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 md:min-h-[402px]"
                            draft={getDraft(KPI.HUMIDITY)}
                            editable={editable}
                            onDraft={onDraft}
                        />
                        <EditableKpiCard
                            kpiName={KPI.BATTERY}
                            title="Battery:"
                            sub="Charge left in the monitoring device battery"
                            ink="#6B3A7E"
                            deco={<Battery strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#8A1F72] opacity-[0.12]" />}
                            delay={300}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 md:min-h-[402px]"
                            draft={getDraft(KPI.BATTERY)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.battery}
                        />
                        <EditableKpiCard
                            kpiName={KPI.SHOCK}
                            title="Shock detection:"
                            sub="Impacts or sudden movement of the tank"
                            ink="#6B3A7E"
                            deco={<Zap strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#1F6178] opacity-[0.12]" />}
                            delay={340}
                            className="col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 md:min-h-[402px]"
                            draft={getDraft(KPI.SHOCK)}
                            editable={editable}
                            onDraft={onDraft}
                            currentReading={live.shockCurrent}
                        />
                    </div>
                </div>
                </div>

                {/* Save bar — a static footer outside the scroll area, so it's always visible without scrolling */}
                {editable && tankId != null && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2 shadow-[0_10px_34px_rgba(0,0,0,0.1)]">
                            {dirtyKpis.length > 0 && (
                                <span className="text-xs font-semibold text-gray-800">
                                    {dirtyKpis.length} unsaved threshold change{dirtyKpis.length > 1 ? "s" : ""}
                                </span>
                            )}
                            <div className="flex items-center gap-1 ml-auto">
                                {/* Copy to Additional Tanks */}
                                {otherTanks.length > 0 && configRows.length > 0 && (
                                    <div className="relative">
                                        <button
                                            id="onboarding-alert-copy-tanks"
                                            type="button"
                                            onClick={() => setShowCopyDropdown((v) => !v)}
                                            disabled={savingCopy}
                                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-150 disabled:opacity-50"
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
                                {dirtyKpis.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleDiscard}
                                        disabled={saving}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-150 disabled:opacity-50"
                                    >
                                        Discard
                                    </button>
                                )}
                                <button
                                    id="onboarding-alert-save-btn"
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving || dirtyKpis.length === 0}
                                    className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-light transition-colors duration-150 disabled:opacity-60 flex items-center gap-1.5"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="animate-spin w-3.5 h-3.5" />
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
        </LockedContext.Provider>
    );
});

export default CryoBentoGrid;
