import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { ivfService, type IvfBranch, type HospitalNotificationSettings } from "../../services/ivfService";
import { shipmentService } from "../../services/shipmentService";
import CriticalAlertsIcon from "../../assets/DashBoardIcons/Critical_Alerts.svg";
import PageLayout from "../../components/PageLayout";
import { Bell, ChevronDown, History, Sparkles, X } from "lucide-react";
import { useOnboardingMode } from "../../contexts/OnboardingModeContext";
import CryoBentoGrid, { type CryoBentoGridHandle } from "./CryoBentoGrid";
import DeviceKpiGrid, { type DeviceKpiGridHandle } from "./DeviceKpiGrid";
import CryoHistoryModal from "./CryoHistoryModal";
import { Switch } from "../../components/ui/switch";

interface ContainerRow {
    tank_id: number;
    canisterId: string;
    branchName: string;
    branch_id: number;
    status: string;
    date: string;
    is_incubator: boolean;
    incubator_id?: number | null;
    chamber_r?: number | null;
    chamber_c?: number | null;
    is_refrigerator?: boolean;
    refrigerator_id?: number | null;
    zones?: Array<{ zone_id: string; zone_name: string }>;
}

export default function AlertSetting() {
    const { isAuthenticated } = useAuth();
    const isOnboarding = useOnboardingMode();
    const [searchParams, setSearchParams] = useSearchParams();

    const directionFilter: "cryotanks" | "incubators" | "refrigerators" = (() => {
        const v = searchParams.get("direction");
        if (v === "incubators") return "incubators";
        if (v === "refrigerators") return "refrigerators";
        return "cryotanks";
    })();

    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [branchFilter, setBranchFilter] = useState<string>("All");
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
    const branchDropdownRef = useRef<HTMLDivElement>(null);
    const tankDropdownRef = useRef<HTMLDivElement>(null);

    // Sync URL branch_id (numeric) → branchFilter (name) once branches are loaded
    useEffect(() => {
        const branchIdFromUrl = searchParams.get("branch_id");
        if (!branchIdFromUrl || branches.length === 0) return;
        const branch = branches.find((b) => String(b.branch_id) === branchIdFromUrl);
        if (branch && branch.branch_name !== branchFilter) setBranchFilter(branch.branch_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams.get("branch_id"), branches]);

    // Sync branchFilter → URL branch_id
    useEffect(() => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (branchFilter !== "All") {
                const branch = branches.find((b) => b.branch_name === branchFilter);
                if (branch) next.set("branch_id", String(branch.branch_id));
                else next.delete("branch_id");
            } else {
                next.delete("branch_id");
            }
            return next;
        }, { replace: true });
    }, [branchFilter, branches, setSearchParams]);

    const [containers, setContainers] = useState<ContainerRow[]>([]);
    const [containersLoading, setContainersLoading] = useState(false);
    const [containersError, setContainersError] = useState<string | null>(null);

    const [selectedContainers, setSelectedContainers] = useState<ContainerRow[]>([]);
    const primaryContainer = selectedContainers[0] ?? null;
    const [showBranchDropdown, setShowBranchDropdown] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const bentoGridRef = useRef<CryoBentoGridHandle>(null);
    const deviceGridRef = useRef<DeviceKpiGridHandle>(null);

    // Incubator chamber (null = Common / incubator-level) and refrigerator zone.
    const [selectedChamberId, setSelectedChamberId] = useState<string | null>(null);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [showScopeDropdown, setShowScopeDropdown] = useState(false);
    const scopeDropdownRef = useRef<HTMLDivElement>(null);

    // Reset scope when the selected device changes: incubators start at Common,
    // refrigerators default to their first zone.
    useEffect(() => {
        setSelectedChamberId(null);
        setSelectedZoneId(primaryContainer?.zones?.[0]?.zone_id ?? null);
        setShowScopeDropdown(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [primaryContainer?.tank_id]);

    // Below xl1 (1200px) the selector pill bar moves inside the panel, under the
    // "Tank Monitoring" header row; at xl1+ it's the notch overlapping the panel's top edge.
    const [isXl1, setIsXl1] = useState(() =>
        typeof window !== "undefined" ? window.matchMedia("(min-width: 1200px)").matches : true,
    );
    useEffect(() => {
        const mql = window.matchMedia("(min-width: 1200px)");
        const onChange = () => setIsXl1(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    const [showNotifySettings, setShowNotifySettings] = useState(false);
    const [notifySettingsLoading, setNotifySettingsLoading] = useState(false);
    const [notifySettingsSaving, setNotifySettingsSaving] = useState(false);
    const [notifySettingsError, setNotifySettingsError] = useState<
        string | null
    >(null);
    const [notifySettings, setNotifySettings] =
        useState<HospitalNotificationSettings>({
            hospital_id: 0,
            is_push_notify: false,
        });

    useEffect(() => {
        const loadBranches = async () => {
            try {
                const res = await ivfService.getBranches();
                setBranches(Array.isArray(res?.branches) ? res.branches : []);
            } catch {
                setBranches([]);
            }
        };
        if (isAuthenticated) loadBranches();
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        setContainersLoading(true);
        setContainersError(null);
        setSelectedContainers([]);

        const fetchPromise = directionFilter === "refrigerators"
            ? shipmentService.getActiveRefrigerators({}).then((data) => {
                return data.branches.flatMap((branch) =>
                    branch.refrigerators.map((ref) => ({
                        tank_id: ref.refrigerator_id,
                        canisterId: ref.refrigerator_code ?? String(ref.refrigerator_id),
                        branchName: branch.branch_name,
                        branch_id: branch.branch_id,
                        status: "Safe" as const,
                        date: ref.updated_at ? new Date(ref.updated_at).toLocaleDateString("en-GB") : "-",
                        is_incubator: false,
                        incubator_id: null,
                        chamber_r: null,
                        chamber_c: null,
                        is_refrigerator: true,
                        refrigerator_id: ref.refrigerator_id,
                        zones: ref.zones ?? [],
                    }))
                );
            })
            : directionFilter === "incubators"
            ? shipmentService.getActiveIncubators({}).then((data) => {
                return data.branches.flatMap((branch) =>
                    branch.incubators.map((inc) => ({
                        tank_id: inc.incubator_id,
                        canisterId: inc.incubator_code ?? String(inc.incubator_id),
                        branchName: branch.branch_name,
                        branch_id: branch.branch_id,
                        status: "Safe" as const,
                        date: inc.updated_at ? new Date(inc.updated_at).toLocaleDateString("en-GB") : "-",
                        is_incubator: true,
                        incubator_id: inc.incubator_id,
                        chamber_r: inc.chamber_r,
                        chamber_c: inc.chamber_c,
                        is_refrigerator: false,
                        refrigerator_id: null,
                    }))
                );
            })
            : shipmentService.getActiveCanisters({}).then((data: any) => {
                let list: ContainerRow[] = [];
                if (data?.branches && Array.isArray(data.branches)) {
                    list = data.branches.flatMap((branch: any) => {
                        const tanks = branch.tanks || branch.canisters || [];
                        return tanks.map((t: any) => {
                            const status = (t.status || t.canister_status || "safe").toString();
                            return {
                                tank_id: t.tank_id ?? t.canister_id ?? 0,
                                canisterId: String(t.tank_code ?? t.canister_number ?? t.canister_id ?? ""),
                                branchName: branch.branch_name || "N/A",
                                branch_id: branch.branch_id ?? 0,
                                status: status === "critical" ? "Critical" : status === "risk" ? "Risk" : "Safe",
                                date: t.updated_at ? new Date(t.updated_at).toLocaleDateString("en-GB") : "-",
                                is_incubator: false,
                                incubator_id: null,
                                chamber_r: null,
                                chamber_c: null,
                                is_refrigerator: false,
                                refrigerator_id: null,
                            };
                        });
                    });
                }
                return list;
            });

        fetchPromise
            .then((list) => setContainers(list))
            .catch((e: any) => {
                setContainersError(e?.message || "Failed to fetch");
                setContainers([]);
            })
            .finally(() => setContainersLoading(false));
    }, [isAuthenticated, directionFilter]);

    const branchOptions = useMemo(
        () => ["All", ...branches.map((b) => b.branch_name)],
        [branches],
    );
    const filteredContainers = useMemo(() => {
        return containers.filter((c) => {
            const matchBranch = branchFilter === "All" || c.branchName === branchFilter;
            const matchDevice =
                directionFilter === "refrigerators"
                    ? !!c.is_refrigerator
                    : directionFilter === "incubators"
                        ? c.is_incubator
                        : !c.is_incubator && !c.is_refrigerator;
            return matchBranch && matchDevice;
        });
    }, [containers, branchFilter, directionFilter]);

    const otherTanks = useMemo(() => {
        if (!primaryContainer || primaryContainer.is_incubator || primaryContainer.is_refrigerator) {
            return [];
        }
        return containers.filter((c) => {
            const matchBranch = branchFilter === "All" || c.branchName === branchFilter;
            const isCryotank = !c.is_incubator && !c.is_refrigerator;
            return matchBranch && isCryotank && c.tank_id !== primaryContainer.tank_id;
        }).map((c) => ({
            tank_id: c.tank_id,
            canisterId: c.canisterId,
            branchName: c.branchName,
        }));
    }, [containers, branchFilter, primaryContainer]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOnboarding) return;
            if (
                branchDropdownRef.current &&
                !branchDropdownRef.current.contains(event.target as Node)
            ) {
                setIsBranchDropdownOpen(false);
            }
            if (
                tankDropdownRef.current &&
                !tankDropdownRef.current.contains(event.target as Node)
            ) {
                setShowBranchDropdown(false);
            }
            if (
                scopeDropdownRef.current &&
                !scopeDropdownRef.current.contains(event.target as Node)
            ) {
                setShowScopeDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [isOnboarding]);

    const openNotifySettings = async () => {
        setShowNotifySettings(true);
        setNotifySettingsError(null);
        setNotifySettingsLoading(true);
        try {
            const res = await ivfService.getHospitalNotificationSettings();
            setNotifySettings(res);
        } catch (e: any) {
            setNotifySettingsError(
                e?.message || "Failed to load notification settings",
            );
        } finally {
            setNotifySettingsLoading(false);
        }
    };

    const handleTogglePushNotify = (enabled: boolean) => {
        setNotifySettings((prev) => ({ ...prev, is_push_notify: enabled }));
        setNotifySettingsError(null);
    };

    const handleSaveNotifySettings = async () => {
        setNotifySettingsSaving(true);
        setNotifySettingsError(null);
        try {
            await ivfService.updateHospitalNotificationSettings({
                is_push_notify: notifySettings.is_push_notify,
            });
            const updatedSettings =
                await ivfService.getHospitalNotificationSettings();
            setNotifySettings(updatedSettings);
            setShowNotifySettings(false);
        } catch (e: any) {
            setNotifySettingsError(
                e?.message || "Failed to save notification settings",
            );
        } finally {
            setNotifySettingsSaving(false);
        }
    };

    const deviceLabel =
        directionFilter === "incubators"
            ? "Incubator"
            : directionFilter === "refrigerators"
                ? "Refrigerator"
                : "Cryotank";
    // Scope pill (chamber for incubators, zone for refrigerators). Shown only once
    // a device is selected and the direction is incubator/refrigerator.
    const scopeOptions: Array<{ id: string | null; label: string }> = (() => {
        if (!primaryContainer) return [];
        if (primaryContainer.is_incubator) {
            const total = (primaryContainer.chamber_r ?? 0) * (primaryContainer.chamber_c ?? 0);
            return [
                { id: null, label: "Common" },
                ...Array.from({ length: total }, (_, i) => ({ id: String(i + 1), label: `Chamber ${i + 1}` })),
            ];
        }
        if (primaryContainer.is_refrigerator) {
            return (primaryContainer.zones ?? []).map((z) => ({ id: z.zone_id, label: z.zone_name }));
        }
        return [];
    })();
    const showScopePill = !!primaryContainer && (primaryContainer.is_incubator || primaryContainer.is_refrigerator) && scopeOptions.length > 0;
    const scopeValue: string | null = primaryContainer?.is_refrigerator ? selectedZoneId : selectedChamberId;
    const scopeLabel =
        scopeOptions.find((o) => o.id === scopeValue)?.label ??
        (primaryContainer?.is_incubator ? "Common" : "Select Zone");
    const setScope = (id: string | null) => {
        if (primaryContainer?.is_refrigerator) setSelectedZoneId(id);
        else setSelectedChamberId(id);
        setShowScopeDropdown(false);
    };

    return (
        <>
                <PageLayout
                    title="Alert Configuration"
                    description="Set alert thresholds for each device and KPI."
                    icon={CriticalAlertsIcon}
                    patternBackground
                    actions={
                        <button
                            id="onboarding-alert-config-history"
                            type="button"
                            onClick={() => setShowHistory(true)}
                            className="h-9 px-3 md:px-4 rounded-lg bg-white text-gray-700 border border-line hover:bg-gray-50 text-[13px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                            <History className="w-4 h-4" />
                            <span className="hidden sm:inline">Config History</span>
                        </button>
                    }
                >
                    {(() => {
                    const pillBar = (
                        <div className={`relative flex flex-row flex-wrap items-center justify-center gap-1.5 px-2.5 bg-primary max-w-full ${isXl1 ? "py-2 rounded-b-[26px]" : "py-1.5 rounded-[26px] min-[490px]:rounded-full"}`}>
                            {/* Inverted corner curls so the notch flows into the panel edge — xl1 only */}
                            {isXl1 && (
                                <>
                                    <span
                                        aria-hidden
                                        className="absolute top-0 -left-4 w-4 h-4"
                                        style={{ background: "radial-gradient(circle at 0 100%, transparent 15.5px, #6b1176 16px)" }}
                                    />
                                    <span
                                        aria-hidden
                                        className="absolute top-0 -right-4 w-4 h-4"
                                        style={{ background: "radial-gradient(circle at 100% 100%, transparent 15.5px, #6b1176 16px)" }}
                                    />
                                </>
                            )}
                            {/* Branch pill */}
                            <div className="relative max-[490px]:flex-1 max-[490px]:basis-[calc(50%-0.1875rem)] max-[490px]:min-w-0" ref={branchDropdownRef}>
                                <button
                                    id="onboarding-alert-branch-dropdown"
                                    type="button"
                                    onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                                    className={`h-9 px-4 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors focus:outline-none max-[490px]:w-full ${
                                        branchFilter !== "All"
                                            ? "bg-white text-primary"
                                            : "text-white/90 border border-white/15 hover:bg-white/10"
                                    }`}
                                >
                                    {branchFilter === "All" ? "All Branches" : branchFilter}
                                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isBranchDropdownOpen ? "rotate-180" : ""}`} />
                                </button>
                                {isBranchDropdownOpen && (
                                    <div id="onboarding-alert-branch-dropdown-list" className="absolute top-full mt-2 left-0 w-44 z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                        {branchOptions.map((opt) => {
                                            const branchObj = branches.find((b) => b.branch_name === opt);
                                            return (
                                                <button
                                                    key={opt}
                                                    id={branchObj ? `onboarding-alert-branch-${branchObj.branch_id}` : undefined}
                                                    type="button"
                                                    onClick={() => {
                                                        setBranchFilter(opt);
                                                        setIsBranchDropdownOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs transition-colors duration-150 ${
                                                        branchFilter === opt
                                                            ? "bg-primary/10 text-primary font-medium"
                                                            : "text-gray-700 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    {opt === "All" ? "All Branches" : opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Tank / Incubator pill */}
                            <div className="relative max-[490px]:flex-1 max-[490px]:basis-[calc(50%-0.1875rem)] max-[490px]:min-w-0" ref={tankDropdownRef}>
                                <button
                                    id="onboarding-alert-tank-dropdown"
                                    type="button"
                                    onClick={() => {
                                        if (!containersLoading && filteredContainers.length > 0) {
                                            setShowBranchDropdown(!showBranchDropdown);
                                        }
                                    }}
                                    disabled={containersLoading || filteredContainers.length === 0}
                                    className={`h-9 px-4 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed max-[490px]:w-full ${
                                        primaryContainer
                                            ? "bg-white text-primary"
                                            : "text-white/90 border border-white/15 hover:bg-white/10"
                                    }`}
                                >
                                    {containersLoading
                                        ? "Loading..."
                                        : primaryContainer
                                            ? `${deviceLabel} ${primaryContainer.canisterId}`
                                            : `Select ${deviceLabel}`}
                                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${showBranchDropdown ? "rotate-180" : ""}`} />
                                </button>

                                {showBranchDropdown && filteredContainers.length > 0 && (
                                    <div id="onboarding-alert-tank-dropdown-list" className="absolute top-full mt-2 left-0 w-44 z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                        {filteredContainers.map((c) => {
                                            const isSelected = selectedContainers.some((s) => s.tank_id === c.tank_id);
                                            return (
                                                <button
                                                    key={`${c.branch_id}-${c.tank_id}-${c.canisterId}`}
                                                    id={`onboarding-alert-container-${c.canisterId}`}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedContainers([c]);
                                                        setShowBranchDropdown(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs transition-colors duration-150 border-b border-gray-100 last:border-b-0 ${
                                                        isSelected
                                                            ? "bg-primary/10 text-primary font-medium"
                                                            : "text-gray-700 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    <div>
                                                        <p className="font-semibold">{deviceLabel} {c.canisterId}</p>
                                                        <p className="text-gray-400">{c.branchName}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Chamber / Zone pill (incubators + refrigerators) */}
                            {showScopePill && (
                                <div className="relative max-[490px]:flex-1 max-[490px]:basis-[calc(50%-0.1875rem)] max-[490px]:min-w-0" ref={scopeDropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => setShowScopeDropdown((v) => !v)}
                                        className={`h-9 px-4 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors focus:outline-none max-[490px]:w-full ${
                                            scopeValue !== null
                                                ? "bg-white text-primary"
                                                : "text-white/90 border border-white/15 hover:bg-white/10"
                                        }`}
                                    >
                                        {scopeLabel}
                                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${showScopeDropdown ? "rotate-180" : ""}`} />
                                    </button>
                                    {showScopeDropdown && (
                                        primaryContainer?.is_incubator ? (
                                            /* Chamber grid — mirrors the incubator's physical rows × cols layout */
                                            <div className="absolute top-full mt-2 left-0 z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 w-max max-w-[80vw]">
                                                <button
                                                    type="button"
                                                    onClick={() => setScope(null)}
                                                    className={`w-full h-8 mb-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                                                        selectedChamberId === null
                                                            ? "bg-primary text-white"
                                                            : "bg-white text-gray-500 border border-gray-200 hover:border-primary hover:text-primary"
                                                    }`}
                                                >
                                                    Common
                                                </button>
                                                <div
                                                    className="grid gap-1.5"
                                                    style={{ gridTemplateColumns: `repeat(${primaryContainer.chamber_c ?? 1}, minmax(28px, 1fr))` }}
                                                >
                                                    {Array.from({ length: primaryContainer.chamber_r ?? 0 }).map((_, r) =>
                                                        Array.from({ length: primaryContainer.chamber_c ?? 0 }).map((_, c) => {
                                                            const num = r * (primaryContainer.chamber_c ?? 0) + c + 1;
                                                            const id = String(num);
                                                            const active = selectedChamberId === id;
                                                            return (
                                                                <button
                                                                    key={id}
                                                                    type="button"
                                                                    onClick={() => setScope(active ? null : id)}
                                                                    className={`h-8 min-w-[28px] rounded-lg text-xs font-semibold transition-all duration-150 ${
                                                                        active
                                                                            ? "bg-primary text-white"
                                                                            : "bg-white text-gray-500 border border-gray-200 hover:border-primary hover:text-primary"
                                                                    }`}
                                                                >
                                                                    {num}
                                                                </button>
                                                            );
                                                        }),
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="absolute top-full mt-2 left-0 w-44 z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                {scopeOptions.map((opt) => (
                                                    <button
                                                        key={opt.id ?? "__common__"}
                                                        type="button"
                                                        onClick={() => setScope(opt.id)}
                                                        className={`w-full text-left px-3 py-2 text-xs transition-colors duration-150 ${
                                                            opt.id === scopeValue
                                                                ? "bg-primary/10 text-primary font-medium"
                                                                : "text-gray-700 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>

                            {/* Notifications pill */}
                            <button
                                id="onboarding-alert-notify-open"
                                type="button"
                                onClick={openNotifySettings}
                                className="h-9 px-4 rounded-full text-[13px] font-semibold text-white/90 border border-white/15 hover:bg-white/10 flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors max-[490px]:w-full"
                            >
                                <Bell className="w-3.5 h-3.5" />
                                Notifications
                            </button>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    );
                    return (
                    <div className="relative flex flex-col flex-1 min-h-0">
                        {/* xl1+: notch that blends into the KPI panel's top edge. Below xl1: normal row above the panel. */}
                        {isXl1 ? (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30">
                                {pillBar}
                            </div>
                        ) : (
                            <div className="flex justify-center mb-3">
                                {pillBar}
                            </div>
                        )}
                        {containersError && (
                            <p className="mt-2 text-xs text-red-600">{containersError}</p>
                        )}
                        <section id="onboarding-alert-kpi-panel" className="bg-white rounded-2xl border border-line p-4 min-w-0 flex flex-1 flex-col min-h-0 xl1:relative">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h2 className="font-bold text-black text-base">
                                    {deviceLabel} Configuration
                                </h2>
                                <div className="flex items-center gap-2">
                                    {(primaryContainer || directionFilter === "cryotanks") && (
                                        <div className="relative group hidden md:block">
                                            <button
                                                id="onboarding-alert-set-recommended"
                                                type="button"
                                                disabled={!primaryContainer}
                                                onClick={() => {
                                                    if (primaryContainer?.is_incubator || primaryContainer?.is_refrigerator) {
                                                        deviceGridRef.current?.applyRecommended();
                                                    } else {
                                                        bentoGridRef.current?.applyRecommended();
                                                    }
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-light active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
                                            >
                                                <Sparkles size={14} />
                                                Set Recommended
                                            </button>
                                            <div className="pointer-events-none absolute right-0 top-full mt-2 w-max max-w-52 rounded-xl bg-black text-white text-[11px] font-medium px-3 py-2 shadow-lg opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 z-20">
                                                {primaryContainer
                                                    ? "Fills every KPI with safe recommended thresholds and turns those alerts on. Nothing is applied until you review and press Save Changes."
                                                    : "Select a container first to apply recommended thresholds."}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {directionFilter === "incubators" || directionFilter === "refrigerators" ? (
                                <div className="flex-1 min-h-0 flex flex-col">
                                    <DeviceKpiGrid
                                        ref={deviceGridRef}
                                        deviceType={directionFilter === "refrigerators" ? "refrigerator" : "incubator"}
                                        deviceId={
                                            !primaryContainer
                                                ? null
                                                : primaryContainer.is_refrigerator
                                                    ? (primaryContainer.refrigerator_id ?? primaryContainer.tank_id)
                                                    : (primaryContainer.incubator_id ?? primaryContainer.tank_id)
                                        }
                                        scopeId={
                                            !primaryContainer
                                                ? null
                                                : primaryContainer.is_refrigerator
                                                    ? selectedZoneId
                                                    : selectedChamberId
                                        }
                                        scopeNoun={directionFilter === "refrigerators" ? "Zone" : "Chamber"}
                                        scopeName={
                                            directionFilter === "refrigerators" && scopeValue != null
                                                ? scopeOptions.find((o) => o.id === scopeValue)?.label ?? null
                                                : null
                                        }
                                        otherScopes={scopeOptions
                                            .filter((o) => o.id !== null && o.id !== scopeValue)
                                            .map((o) => ({ id: o.id as string, label: o.label }))}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 min-h-0 flex flex-col">
                                    <CryoBentoGrid
                                        ref={bentoGridRef}
                                        tankId={primaryContainer?.tank_id ?? null}
                                        tankCode={primaryContainer?.canisterId ?? null}
                                        isCryotank={
                                            !primaryContainer ||
                                            (!primaryContainer.is_incubator && !primaryContainer.is_refrigerator)
                                        }
                                        otherTanks={otherTanks}
                                    />
                                </div>
                            )}
                        </section>
                    </div>
                    );
                    })()}
                </PageLayout>

                <CryoHistoryModal
                    isOpen={showHistory}
                    onClose={() => setShowHistory(false)}
                    tankId={
                        primaryContainer && !primaryContainer.is_incubator && !primaryContainer.is_refrigerator
                            ? primaryContainer.tank_id
                            : null
                    }
                    tankCode={
                        primaryContainer && !primaryContainer.is_incubator && !primaryContainer.is_refrigerator
                            ? primaryContainer.canisterId
                            : null
                    }
                />

                {/* Push notification settings modal — hospital-wide toggle. Email/WhatsApp
                    are configured per-KPI inside CryoBentoGrid. */}
                {showNotifySettings && (
                    <div
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                        onClick={() => {
                            if (!notifySettingsSaving && !isOnboarding) {
                                setShowNotifySettings(false);
                                setNotifySettingsError(null);
                            }
                        }}
                    >
                        <div
                            id="onboarding-alert-notify-modal"
                            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-lg text-black">
                                    Push Notifications
                                </h3>
                                <button
                                    id="onboarding-alert-notify-close"
                                    type="button"
                                    onClick={() => {
                                        if (!notifySettingsSaving) {
                                            setShowNotifySettings(false);
                                            setNotifySettingsError(null);
                                        }
                                    }}
                                    className="w-8 h-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500"
                                    aria-label="Close notification settings"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <p className="text-sm text-gray-600 mb-4">
                                Send a browser push notification to concerned users when a
                                critical alert fires for this hospital.
                            </p>

                            {notifySettingsLoading ? (
                                <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
                                    Loading settings...
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between py-2">
                                        <label
                                            htmlFor="notify-push"
                                            className="text-sm font-medium text-gray-900 cursor-pointer select-none"
                                        >
                                            Push Notification
                                        </label>
                                        <Switch
                                            id="notify-push"
                                            checked={notifySettings.is_push_notify}
                                            onCheckedChange={handleTogglePushNotify}
                                            disabled={notifySettingsSaving}
                                        />
                                    </div>

                                    {notifySettingsError && (
                                        <p className="text-sm text-red-600">
                                            {notifySettingsError}
                                        </p>
                                    )}

                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!notifySettingsSaving) {
                                                    setShowNotifySettings(false);
                                                    setNotifySettingsError(null);
                                                }
                                            }}
                                            disabled={notifySettingsSaving}
                                            className="px-4 py-2 border border-line rounded text-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSaveNotifySettings}
                                            disabled={notifySettingsSaving}
                                            className="px-4 py-2 bg-primary text-white rounded text-sm hover:bg-[#8a2a95] disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {notifySettingsSaving ? (
                                                <>
                                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Saving...
                                                </>
                                            ) : (
                                                "Save"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
        </>
    );
}
