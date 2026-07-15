import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { ivfService, type IvfBranch } from "../../services/ivfService";
import { shipmentService } from "../../services/shipmentService";
import CriticalAlertsIcon from "../../assets/DashBoardIcons/Critical_Alerts.svg";
import PageLayout from "../../components/PageLayout";
import FilterPanel, { FilterSelect } from "../../components/FilterPanel";
import { ChevronDown, History, Sparkles, X } from "lucide-react";
import { useOnboardingMode } from "../../contexts/OnboardingModeContext";
import CryoBentoGrid, { type CryoBentoGridHandle } from "./CryoBentoGrid";
import CryoHistoryModal from "./CryoHistoryModal";

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
    const [showKpiPanel, setShowKpiPanel] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const bentoGridRef = useRef<CryoBentoGridHandle>(null);

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

    useEffect(() => {
        if (primaryContainer) {
            setShowKpiPanel(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [primaryContainer?.tank_id]);

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
    const activeFilterCount = useMemo(
        () => (branchFilter !== "All" ? 1 : 0),
        [branchFilter],
    );

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
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [isOnboarding]);

    const deviceLabel =
        directionFilter === "incubators"
            ? "Incubator"
            : directionFilter === "refrigerators"
                ? "Refrigerator"
                : "Cryotank";

    return (
        <>
                <PageLayout
                    title="Alert Configuration"
                    description="Set alert thresholds for each device and KPI."
                    icon={CriticalAlertsIcon}
                    actions={
                        <div className="md:hidden">
                            <FilterPanel activeCount={activeFilterCount}>
                                <FilterSelect
                                    label="Branch"
                                    value={branchFilter}
                                    options={branchOptions}
                                    allLabel="All Branches"
                                    onChange={(v) => setBranchFilter(v)}
                                />
                            </FilterPanel>
                        </div>
                    }
                >
                    {/* Header: Branch + Tank Selection */}
                    <div className="bg-white border border-line rounded-xl p-4 w-full">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 xl1:gap-6">
                            {/* Branch Selection */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Branch Selection</label>
                                <div className="relative" ref={branchDropdownRef}>
                                    <button
                                        id="onboarding-alert-branch-dropdown"
                                        type="button"
                                        onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                                        className="w-full h-12 px-4 bg-primary/10 border border-primary/20 rounded-lg text-sm text-left flex items-center justify-between hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                                <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/></svg>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900 truncate">{branchFilter === "All" ? "All Branches" : branchFilter}</p>
                                            </div>
                                        </div>
                                        <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${isBranchDropdownOpen ? "rotate-180" : ""}`} />
                                    </button>
                                    {isBranchDropdownOpen && (
                                        <div id="onboarding-alert-branch-dropdown-list" className="absolute top-full mt-2 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
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
                                                        className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 ${
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
                            </div>

                            {/* Tank Selection */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                    {directionFilter === "incubators" ? "Incubator Selection" : "Tank Selection"}
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!containersLoading && filteredContainers.length > 0) {
                                                setShowBranchDropdown(!showBranchDropdown);
                                            }
                                        }}
                                        disabled={containersLoading || filteredContainers.length === 0}
                                        className="w-full h-12 px-4 bg-primary/10 border border-primary/20 rounded-lg text-sm text-left flex items-center justify-between hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                                <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11z"/></svg>
                                            </div>
                                            <div className="min-w-0">
                                                {containersLoading ? (
                                                    <p className="text-sm text-gray-500">Loading...</p>
                                                ) : primaryContainer ? (
                                                    <>
                                                        <p className="font-semibold text-gray-900 truncate">
                                                            {deviceLabel} {primaryContainer.canisterId}
                                                        </p>
                                                        <p className="text-xs text-gray-500 truncate">{primaryContainer.branchName}</p>
                                                    </>
                                                ) : (
                                                    <p className="font-semibold text-gray-500">Select a container</p>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${showBranchDropdown ? "rotate-180" : ""}`} />
                                    </button>

                                    {showBranchDropdown && filteredContainers.length > 0 && (
                                        <div className="absolute top-full mt-2 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                            {filteredContainers.map((c) => {
                                                const isSelected = selectedContainers.some((s) => s.tank_id === c.tank_id);
                                                return (
                                                    <button
                                                        key={`${c.branch_id}-${c.tank_id}-${c.canisterId}`}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedContainers([c]);
                                                            setShowBranchDropdown(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 border-b border-gray-100 last:border-b-0 ${
                                                            isSelected
                                                                ? "bg-primary/10 text-primary font-medium"
                                                                : "text-gray-700 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        <div>
                                                            <p className="font-medium">{deviceLabel} {c.canisterId}</p>
                                                            <p className="text-xs text-gray-500">{c.branchName}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                {containersError && (
                                    <p className="mt-3 text-xs text-red-600">{containersError}</p>
                                )}
                            </div>

                            {/* History */}
                            <div className="flex flex-col">
                                <span className="hidden md:block text-xs font-bold text-transparent uppercase tracking-widest mb-2 select-none" aria-hidden>History</span>
                                <button
                                    type="button"
                                    onClick={() => setShowHistory(true)}
                                    className="h-12 flex items-center justify-center gap-1.5 px-4 bg-white text-gray-700 border border-line rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                                >
                                    <History className="w-4 h-4" />
                                    View Alert History
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col xl1:flex-row gap-6 flex-1 min-h-0">
                        {/* Overlay backdrop — mobile only */}
                        {showKpiPanel && (
                            <div
                                className="xl1:hidden fixed inset-0 bg-black/40 z-40"
                                onClick={() => { setShowKpiPanel(false); setSelectedContainers([]); }}
                            />
                        )}
                        <section id="onboarding-alert-kpi-panel" className={`bg-white rounded-lg border border-line p-4 min-w-0 overflow-y-auto xl1:flex xl1:flex-1 xl1:flex-col xl1:overflow-hidden xl1:relative xl1:inset-auto xl1:z-auto ${showKpiPanel ? "fixed inset-x-3 top-14 bottom-3 z-50 flex flex-col" : "hidden"}`}>
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h2 className="font-bold text-black text-base">
                                    Tank Monitoring
                                    {primaryContainer ? ` — ${deviceLabel} ${primaryContainer.canisterId}` : ""}
                                </h2>
                                <div className="flex items-center gap-2">
                                    {(directionFilter === "cryotanks"
                                        ? !primaryContainer || (!primaryContainer.is_incubator && !primaryContainer.is_refrigerator)
                                        : primaryContainer && !primaryContainer.is_incubator && !primaryContainer.is_refrigerator) && (
                                        <div className="relative group">
                                            <button
                                                type="button"
                                                disabled={!primaryContainer}
                                                onClick={() => bentoGridRef.current?.applyRecommended()}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-light active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
                                            >
                                                <Sparkles size={14} />
                                                Set Recommended
                                            </button>
                                            <div className="pointer-events-none absolute right-0 top-full mt-2 w-64 rounded-xl bg-primary text-white text-[11px] font-medium px-3 py-2 shadow-lg opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 z-20">
                                                {primaryContainer
                                                    ? "Fills every KPI with safe recommended thresholds and turns those alerts on. Nothing is applied until you review and press Save Changes."
                                                    : "Select a container first to apply recommended thresholds."}
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setShowKpiPanel(false); setSelectedContainers([]); }}
                                        className="xl1:hidden p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                        aria-label="Close"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            {!primaryContainer && directionFilter !== "cryotanks" ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-center text-gray-400">
                                        <svg
                                            className="w-16 h-16 mx-auto mb-3 opacity-50"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                        >
                                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                                            <rect
                                                x="9"
                                                y="3"
                                                width="6"
                                                height="4"
                                                rx="1"
                                            />
                                            <path
                                                d="M9 12h6M9 16h6"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <p className="text-md">
                                            Select a container to view live monitoring
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 min-h-0 xl1:overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
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
        </>
    );
}
