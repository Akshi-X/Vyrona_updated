import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "react-toastify";
import {
    Battery,
    CloudFog,
    CloudRain,
    DoorOpen,
    FlaskConical,
    Gauge,
    Loader2,
    Thermometer,
    ThermometerSun,
    Wind,
} from "lucide-react";
import { ivfService, type KpiConfigRow } from "../../services/ivfService";
import {
    BentoCard,
    BentoStyles,
    CardTitle,
    ChannelBar,
    EMPTY_DRAFT,
    EditableKpiCard,
    EscalationRow,
    KpiPolicyContext,
    LoadingMessage,
    LockedContext,
    sameDraft,
    type KpiDraft,
    type KpiPolicy,
    type KpiSliderMeta,
} from "./CryoBentoGrid";

const INK = "#6B3A7E";
const INK_SOFT = "#000000";

// ─── KPI names ───────────────────────────────────────────────────────────────

const DKPI = {
    TEMP_EXTERNAL: "temp_external",
    INC_O2: "incubator_o2",
    INC_CO2: "incubator_co2",
    INC_TEMP: "incubator_temp",
    INC_HUMIDITY: "incubator_humidity",
    INC_PH: "incubator_ph",
    INC_VOC: "incubator_voc",
    INC_LID_STATE: "incubator_lid_state",
    INC_BATTERY: "incubator_battery",
    REF_HUMIDITY: "refrigerator_humidity",
    REF_TEMP: "refrigerator_temp",
} as const;

/**
 * Incubator KPIs shown once a specific chamber is selected. Ordered so the
 * embryo-critical, dual-channel (WhatsApp + email) KPIs sit first, then the
 * in-app-only ones.
 */
const INCUBATOR_KPI_NAMES = [
    DKPI.INC_TEMP,
    DKPI.INC_CO2,
    DKPI.INC_PH,
    DKPI.INC_LID_STATE,
    DKPI.INC_O2,
    DKPI.INC_HUMIDITY,
    DKPI.INC_VOC,
];
/** Incubator-level (Common) scope: device battery, not tied to any one chamber. */
const INCUBATOR_COMMON_KPI_NAMES = [DKPI.INC_BATTERY];
const REFRIGERATOR_KPI_NAMES = [DKPI.REF_TEMP, DKPI.REF_HUMIDITY];

// ─── Slider metadata (bounds, step, unit) ────────────────────────────────────

const DEVICE_META: Record<string, KpiSliderMeta> = {
    [DKPI.TEMP_EXTERNAL]: { label: "External Temperature", unit: "°C", lo: 15, hi: 55, step: 0.5, dual: true },
    [DKPI.INC_O2]: { label: "O₂ Level", unit: "%", lo: 0, hi: 21, step: 0.1, dual: true },
    [DKPI.INC_CO2]: { label: "CO₂ Level", unit: "%", lo: 0, hi: 15, step: 0.1, dual: true },
    [DKPI.INC_TEMP]: { label: "Temperature", unit: "°C", lo: 30, hi: 40, step: 0.1, dual: true },
    [DKPI.INC_HUMIDITY]: { label: "Humidity", unit: "%", lo: 0, hi: 100, step: 1, dual: true },
    [DKPI.INC_PH]: { label: "pH Level", unit: "pH", lo: 6, hi: 8, step: 0.01, dual: true },
    [DKPI.INC_VOC]: { label: "VOC", unit: "ppb", lo: 0, hi: 1000, step: 1, dual: true },
    [DKPI.INC_LID_STATE]: { label: "Lid State", unit: "", lo: 0, hi: 1, step: 1, dual: false },
    [DKPI.INC_BATTERY]: { label: "Battery", unit: "%", lo: 0, hi: 100, step: 1, dual: false },
    [DKPI.REF_HUMIDITY]: { label: "Humidity", unit: "%", lo: 0, hi: 100, step: 1, dual: true },
    [DKPI.REF_TEMP]: { label: "Temperature", unit: "°C", lo: -30, hi: 30, step: 0.1, dual: true },
};

// ─── Card presentation (icon watermark + descriptive copy) ───────────────────

interface KpiCardSpec {
    title: string;
    sub: string;
    deco: ReactNode;
}

const KPI_CARD: Record<string, KpiCardSpec> = {
    [DKPI.TEMP_EXTERNAL]: {
        title: "External temperature:",
        sub: "Ambient room temperature around the incubator",
        deco: <ThermometerSun strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.INC_BATTERY]: {
        title: "Battery:",
        sub: "Device battery level for this incubator",
        deco: <Battery strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.INC_O2]: {
        title: "O₂ level:",
        sub: "Oxygen concentration inside the chamber",
        deco: <Wind strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.INC_CO2]: {
        title: "CO₂ level:",
        sub: "Carbon dioxide concentration inside the chamber",
        deco: <CloudFog strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.INC_TEMP]: {
        title: "Temperature:",
        sub: "Culture temperature inside the chamber",
        deco: <Thermometer strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.INC_HUMIDITY]: {
        title: "Humidity:",
        sub: "Relative humidity inside the chamber",
        deco: <CloudRain strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.INC_PH]: {
        title: "pH level:",
        sub: "pH of the culture media",
        deco: <FlaskConical strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.INC_VOC]: {
        title: "VOC:",
        sub: "Volatile organic compound level in the chamber",
        deco: <Gauge strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.REF_HUMIDITY]: {
        title: "Humidity:",
        sub: "Relative humidity inside the refrigerator zone",
        deco: <CloudRain strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
    [DKPI.REF_TEMP]: {
        title: "Temperature:",
        sub: "Probe temperature for the refrigerator zone",
        deco: <Thermometer strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />,
    },
};

const CARD_CLASS = "col-span-12 @4xl:col-span-6 @min-[81rem]:col-span-4 md:min-h-[402px]";

const DEVICE_POLICY: KpiPolicy = {
    metaMap: DEVICE_META,
    defaultChannelsOn: new Set<string>([DKPI.INC_TEMP, DKPI.INC_LID_STATE, DKPI.REF_TEMP]),
    lidStateKpi: DKPI.INC_LID_STATE,
};

/**
 * One-click safe defaults for the "Set Recommended" button, tuned to standard IVF
 * culture conditions. Temp / CO₂ / pH / lid drive embryo viability, so they default
 * to both WhatsApp + email; the rest are in-app soft alerts.
 */
interface RecDefault {
    min: number | null;
    max: number | null;
    whatsapp_alert: boolean;
    email_alert: boolean;
}
const RECOMMENDED: Record<string, RecDefault> = {
    // Incubator — Common scope (ambient)
    [DKPI.TEMP_EXTERNAL]: { min: 18, max: 30, whatsapp_alert: false, email_alert: false },
    [DKPI.INC_BATTERY]: { min: 20, max: null, whatsapp_alert: false, email_alert: false },   // low-battery warning
    // Incubator — per chamber
    [DKPI.INC_TEMP]: { min: 36.5, max: 37.5, whatsapp_alert: true, email_alert: true },   // embryo culture ~37 °C
    [DKPI.INC_CO2]: { min: 5, max: 7, whatsapp_alert: true, email_alert: true },           // ~6 % keeps media pH in band
    [DKPI.INC_O2]: { min: 4, max: 7, whatsapp_alert: false, email_alert: false },          // low-O₂ culture ~5 %
    [DKPI.INC_PH]: { min: 7.2, max: 7.4, whatsapp_alert: true, email_alert: true },        // culture media ~7.3
    [DKPI.INC_HUMIDITY]: { min: 60, max: 95, whatsapp_alert: false, email_alert: false },
    [DKPI.INC_VOC]: { min: 0, max: 500, whatsapp_alert: false, email_alert: false },       // keep VOCs low
    [DKPI.INC_LID_STATE]: { min: 0, max: 0, whatsapp_alert: true, email_alert: true },     // alert when opened
    // Refrigerator — standard 2–8 °C reagent zone
    [DKPI.REF_TEMP]: { min: 2, max: 8, whatsapp_alert: true, email_alert: true },
    [DKPI.REF_HUMIDITY]: { min: 0, max: 70, whatsapp_alert: false, email_alert: false },
};

export interface DeviceKpiGridHandle {
    /** Fill the current scope's KPI drafts with recommended thresholds (still needs Save). */
    applyRecommended: () => void;
}

// ─── Lid-state card (incubator, binary alert) ────────────────────────────────

function LidStateCard({
    live,
    draft,
    editable,
    onDraft,
    delay,
}: {
    live: boolean | null;
    draft: KpiDraft;
    editable: boolean;
    onDraft: (kpiName: string, patch: Partial<KpiDraft>) => void;
    delay: number;
}) {
    const known = live != null;
    const open = live === true;
    return (
        <BentoCard delay={delay} className={`${CARD_CLASS} pt-4 px-0 pb-4 md:p-4 flex flex-col gap-2`}>
            <DoorOpen strokeWidth={1.25} className="absolute top-3 right-3 w-20 h-20 text-[#6B3A7E] opacity-[0.12]" />
            <div className="relative">
                <CardTitle>Lid state:</CardTitle>
                <p className="text-[12px] mt-0.5 text-gray-500">Live open / closed status of the chamber lid</p>
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
                    </div>
                    <EscalationRow kpiName={DKPI.INC_LID_STATE} draft={draft} onDraft={onDraft} />
                    <ChannelBar kpiName={DKPI.INC_LID_STATE} draft={draft} onDraft={onDraft} />
                </div>
            )}
        </BentoCard>
    );
}

// ─── Grid ────────────────────────────────────────────────────────────────────

type DeviceType = "incubator" | "refrigerator";

/**
 * Threshold-config grid for incubators and refrigerators. Mirrors CryoBentoGrid's
 * bento layout but drives its KPI set from the device type and scope:
 * - incubator, chamber selected → per-chamber KPIs (O₂, CO₂, temp, humidity, pH, VOC, lid)
 * - incubator, Common (chamberId null) → external temperature only
 * - refrigerator → temperature + humidity (per zone when zoneId is set)
 */
const DeviceKpiGrid = forwardRef<DeviceKpiGridHandle, {
    deviceType: DeviceType;
    deviceId: number | null;
    /** chamberId for incubators (null = Common), zoneId for refrigerators. */
    scopeId: string | null;
    /** "Chamber" | "Zone" — copy-target label noun. */
    scopeNoun?: string;
    /** Current scope's display name (refrigerator zone name; persisted so derived zone names aren't null). */
    scopeName?: string | null;
    /** Other chambers/zones this scope's config can be copied to (excludes Common + current). */
    otherScopes?: Array<{ id: string; label: string }>;
}>(function DeviceKpiGrid({ deviceType, deviceId, scopeId, scopeNoun = "Chamber", scopeName = null, otherScopes = [] }, ref) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [baseline, setBaseline] = useState<Record<string, KpiDraft>>({});
    const [draft, setDraft] = useState<Record<string, KpiDraft>>({});
    const [live, setLive] = useState<Record<string, number | null>>({});
    const [showCopyDropdown, setShowCopyDropdown] = useState(false);
    const [selectedCopyIds, setSelectedCopyIds] = useState<string[]>([]);
    const [savingCopy, setSavingCopy] = useState(false);
    // Monotonic token so a stale in-flight load (e.g. a post-save reload for a
    // scope the user has since navigated away from) can't overwrite fresh state.
    const loadTokenRef = useRef(0);

    const kpiNames = useMemo(() => {
        if (deviceType === "refrigerator") return REFRIGERATOR_KPI_NAMES;
        // Empty preview (no device selected) shows the full chamber KPI set rather
        // than Common's single external-temperature card.
        if (deviceId == null) return INCUBATOR_KPI_NAMES;
        return scopeId === null ? INCUBATOR_COMMON_KPI_NAMES : INCUBATOR_KPI_NAMES;
    }, [deviceType, scopeId, deviceId]);

    const buildDrafts = (rows: KpiConfigRow[]): Record<string, KpiDraft> => {
        const next: Record<string, KpiDraft> = {};
        for (const k of kpiNames) {
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

    const loadAll = () => {
        if (deviceId == null) return;
        const myToken = ++loadTokenRef.current;
        setLoading(true);
        Promise.allSettled([
            ivfService.getKpiConfigList(deviceId, deviceType, scopeId),
            // Live chamber readings only exist per chamber; Common shows external temp,
            // which this endpoint never returns, so skip the request there.
            deviceType === "incubator" && scopeId != null
                ? ivfService.getChamberLatest(deviceId, scopeId)
                : Promise.resolve([]),
        ]).then(([c, latest]) => {
            if (myToken !== loadTokenRef.current) return;

            const nextLive: Record<string, number | null> = {};
            if (latest.status === "fulfilled" && Array.isArray(latest.value)) {
                for (const item of latest.value) nextLive[item.kpi_name] = item.value;
            }
            setLive(nextLive);

            const rows = c.status === "fulfilled" ? c.value.config ?? [] : [];
            const drafts = buildDrafts(rows);
            setBaseline(drafts);
            setDraft(drafts);
        }).finally(() => {
            if (myToken === loadTokenRef.current) setLoading(false);
        });
    };

    useEffect(() => {
        setLive({});
        setBaseline({});
        setDraft({});
        setSelectedCopyIds([]);
        setShowCopyDropdown(false);
        // Bumping the token invalidates any in-flight load (incl. a post-save reload
        // for a scope we've navigated away from) so it can't overwrite fresh state.
        loadTokenRef.current++;
        if (deviceId == null) return;
        loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceId, deviceType, scopeId]);

    const onDraft = (kpiName: string, patch: Partial<KpiDraft>) => {
        setDraft((prev) => ({
            ...prev,
            [kpiName]: { ...(prev[kpiName] ?? EMPTY_DRAFT), ...patch },
        }));
    };

    const dirtyKpis = useMemo(
        () => kpiNames.filter((k) => draft[k] && !sameDraft(draft[k], baseline[k])),
        [draft, baseline, kpiNames],
    );

    const handleDiscard = () => setDraft({ ...baseline });

    useImperativeHandle(ref, () => ({
        applyRecommended: () => {
            setDraft((prev) => {
                const next = { ...prev };
                for (const k of kpiNames) {
                    const r = RECOMMENDED[k];
                    if (r) {
                        next[k] = {
                            min: r.min,
                            max: r.max,
                            enabled: true,
                            whatsapp_alert: r.whatsapp_alert,
                            email_alert: r.email_alert,
                            unack_escalation_threshold: prev[k]?.unack_escalation_threshold ?? null,
                            cooldown_minutes: prev[k]?.cooldown_minutes ?? 60,
                        };
                    }
                }
                return next;
            });
        },
    }), [kpiNames]);

    const configForKpi = (k: string) => {
        const d = draft[k] ?? EMPTY_DRAFT;
        const alertType = d.enabled ? (d.email_alert ? "critical" : "soft") : null;
        const anyChannelOn = d.enabled && (d.whatsapp_alert || d.email_alert);
        return {
            kpi_name: k,
            alert_name: DEVICE_META[k].label,
            min: d.min,
            max: d.max,
            unit: DEVICE_META[k].unit || null,
            alert_type: alertType,
            cooldown_minutes: d.cooldown_minutes ?? 60,
            unack_escalation_threshold: anyChannelOn ? (d.unack_escalation_threshold ?? null) : null,
            whatsapp_alert: d.enabled && d.whatsapp_alert,
            email_alert: d.enabled && d.email_alert,
            status: d.enabled,
        };
    };

    const persistScope = (
        targetScopeId: string | null,
        kpiKeys: string[],
        zoneName?: string | null,
        copyMeta?: {
            sourceZoneId: string | null;
            sourceZoneName: string | null;
            copiedToZones?: Array<{ zone_id: string | null; zone_name: string | null }>;
        },
    ) => {
        const configs = kpiKeys.map(configForKpi);
        return deviceType === "incubator"
            ? ivfService.bulkUpsertKpiConfigForIncubator(deviceId!, targetScopeId, configs)
            : ivfService.bulkUpsertKpiConfigForRefrigerator(deviceId!, targetScopeId, configs, zoneName ?? null, copyMeta);
    };

    const handleSave = async () => {
        if (deviceId == null || dirtyKpis.length === 0 || saving) return;
        setSaving(true);
        try {
            await persistScope(scopeId, dirtyKpis, scopeName);
            toast.success("Alert thresholds saved");
            loadAll();
        } catch (e: any) {
            toast.error(e?.message || "Failed to save alert thresholds");
        } finally {
            setSaving(false);
        }
    };

    // Copy the current scope's full config (all KPIs, not just dirty) to the selected chambers/zones.
    const handleCopyToScopes = async () => {
        if (deviceId == null || selectedCopyIds.length === 0 || savingCopy) return;
        setSavingCopy(true);
        try {
            const destinations = selectedCopyIds.map((id) => ({
                id,
                name: otherScopes.find((o) => o.id === id)?.label ?? null,
            }));
            for (let i = 0; i < destinations.length; i++) {
                const { id, name } = destinations[i];
                const isLast = i === destinations.length - 1;
                await persistScope(
                    id,
                    kpiNames,
                    name,
                    deviceType === "refrigerator"
                        ? {
                            sourceZoneId: scopeId,
                            sourceZoneName: scopeName ?? null,
                            copiedToZones: isLast ? destinations.map((d) => ({ zone_id: d.id, zone_name: d.name })) : undefined,
                        }
                        : undefined,
                );
            }
            toast.success(`Applied to ${selectedCopyIds.length} ${scopeNoun.toLowerCase()}${selectedCopyIds.length !== 1 ? "s" : ""} successfully`);
        } catch (e: any) {
            toast.error(e?.message || `Failed to copy to ${scopeNoun.toLowerCase()}s`);
        } finally {
            setSavingCopy(false);
            setShowCopyDropdown(false);
            setSelectedCopyIds([]);
        }
    };

    const getDraft = (k: string): KpiDraft => draft[k] ?? EMPTY_DRAFT;
    // Always render the threshold controls; when no device is selected the
    // LockedContext (deviceId == null) disables them, matching the cryotank preview.
    const editable = true;
    // Copy is per specific chamber/zone only — never from the incubator Common scope,
    // whose external-temperature config doesn't belong in real chambers.
    const canCopy =
        deviceId != null &&
        (deviceType === "refrigerator" || scopeId !== null) &&
        otherScopes.length > 0 &&
        kpiNames.some((k) => draft[k]?.enabled);

    return (
        <LockedContext.Provider value={{ locked: deviceId == null, noun: deviceType === "refrigerator" ? "a refrigerator" : "an incubator" }}>
            <KpiPolicyContext.Provider value={DEVICE_POLICY}>
                <BentoStyles />
                <div className="@container relative flex-1 min-h-0 flex flex-col md:rounded-[24px] md:p-3 @2xl:p-4 md:bg-gradient-to-b md:from-primary-bg md:to-[#FAFAFA] md:overflow-hidden">
                    {loading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center">
                            <div className="flex items-center gap-3 rounded-2xl bg-white/85 px-6 py-4 shadow-xl" style={{ color: INK_SOFT }}>
                                <Loader2 className="animate-spin w-6 h-6" />
                                <LoadingMessage />
                            </div>
                        </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        <div className={loading ? "blur-sm pointer-events-none select-none" : ""}>
                            <div className="grid grid-cols-12 gap-3 @2xl:gap-4 max-md:[&>*:not(:first-child)]:border-t max-md:[&>*:not(:first-child)]:border-gray-200">
                                {kpiNames.map((k, i) =>
                                    k === DKPI.INC_LID_STATE ? (
                                        <LidStateCard
                                            key={k}
                                            live={live[DKPI.INC_LID_STATE] != null ? live[DKPI.INC_LID_STATE]! >= 1 : null}
                                            draft={getDraft(k)}
                                            editable={editable}
                                            onDraft={onDraft}
                                            delay={i * 40}
                                        />
                                    ) : (
                                        <EditableKpiCard
                                            key={k}
                                            kpiName={k}
                                            title={KPI_CARD[k].title}
                                            sub={KPI_CARD[k].sub}
                                            ink={INK}
                                            deco={KPI_CARD[k].deco}
                                            delay={i * 40}
                                            className={CARD_CLASS}
                                            draft={getDraft(k)}
                                            editable={editable}
                                            onDraft={onDraft}
                                            currentReading={live[k] ?? null}
                                        />
                                    ),
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Save bar — static footer outside the scroll area, always visible */}
                    {deviceId != null && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2 shadow-[0_10px_34px_rgba(0,0,0,0.1)]">
                            {dirtyKpis.length > 0 && (
                                <span className="text-xs font-semibold text-gray-800">
                                    {dirtyKpis.length} unsaved threshold change{dirtyKpis.length > 1 ? "s" : ""}
                                </span>
                            )}
                            <div className="flex items-center gap-1 ml-auto">
                                {/* Apply to Other Chambers / Zones */}
                                {canCopy && (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowCopyDropdown((v) => !v)}
                                            disabled={savingCopy}
                                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-150 disabled:opacity-50"
                                        >
                                            Apply to Other {scopeNoun}s
                                        </button>
                                        {showCopyDropdown && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setShowCopyDropdown(false)} />
                                                <div className="absolute bottom-full right-0 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                                                        <span className="text-xs text-gray-500">{otherScopes.length} {scopeNoun.toLowerCase()}{otherScopes.length !== 1 ? "s" : ""}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setSelectedCopyIds(
                                                                    otherScopes.every((o) => selectedCopyIds.includes(o.id))
                                                                        ? []
                                                                        : otherScopes.map((o) => o.id),
                                                                )
                                                            }
                                                            className="text-xs text-primary font-medium hover:underline"
                                                        >
                                                            {otherScopes.every((o) => selectedCopyIds.includes(o.id)) && otherScopes.length > 0 ? "Deselect All" : "Select All"}
                                                        </button>
                                                    </div>
                                                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-50" style={{ scrollbarWidth: "thin" }}>
                                                        {otherScopes.map((o) => (
                                                            <label key={o.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedCopyIds.includes(o.id)}
                                                                    onChange={() =>
                                                                        setSelectedCopyIds((prev) =>
                                                                            prev.includes(o.id)
                                                                                ? prev.filter((x) => x !== o.id)
                                                                                : [...prev, o.id],
                                                                        )
                                                                    }
                                                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                                />
                                                                <span className="text-xs font-semibold text-gray-900 truncate">{o.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                                                        <button
                                                            type="button"
                                                            disabled={selectedCopyIds.length === 0 || savingCopy}
                                                            onClick={handleCopyToScopes}
                                                            className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                                        >
                                                            {savingCopy ? (
                                                                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</>
                                                            ) : (
                                                                <>Apply to {selectedCopyIds.length} {scopeNoun}{selectedCopyIds.length !== 1 ? "s" : ""}</>
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
            </KpiPolicyContext.Provider>
        </LockedContext.Provider>
    );
});

export default DeviceKpiGrid;
