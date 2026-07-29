import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { ivfService, type IvfBranch } from "../../services/ivfService";
import { shipmentService } from "../../services/shipmentService";
import CriticalAlertsIcon from "../../assets/DashBoardIcons/Critical_Alerts.svg";
import PageLayout from "../../components/PageLayout";
import FilterPanel, { FilterSelect } from "../../components/FilterPanel";
import { ChevronDown, History, Sparkles } from "lucide-react";
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
            if (
                tankDropdownRef.current &&
                !tankDropdownRef.current.contains(event.target as Node)
            ) {
                setShowBranchDropdown(false);
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
    // Onboarding: pre-fill draft values for Evaporation Rate and Lid State so the
    // Save Changes button becomes active for the final tour step.
    useEffect(() => {
        const handler = () => {
            setMultiDraft("ln2_evaporation_rate", { min: 0.5, max: 2.0, alert_type: "soft", cooldown_minutes: 60 });
            setMultiDraft("ln2_lid_state", { lid_state: "closed", alert_type: "soft", cooldown_minutes: 30 });
        };
        document.addEventListener("onboarding:prefill-alert-evap-lid", handler);
        return () => document.removeEventListener("onboarding:prefill-alert-evap-lid", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormPayload({});
        setFormError(null);
    };

    const validateForm = (): boolean => {
        const name = (formPayload.kpi_name ?? "").trim();
        if (!name) {
            setFormError("KPI name is required");
            return false;
        }
        setFormError(null);
        return true;
    };

    const handleCreate = async () => {
        if (
            !primaryContainer ||
            tankContext.hospital_id == null ||
            tankContext.branch_id == null
        ) {
            setFormError("Missing tank context");
            return;
        }
        if (!validateForm()) return;
        setSubmitLoading(true);
        try {
            const payload: KpiConfigPayload = {
                hospital_id: tankContext.hospital_id,
                branch_id: tankContext.branch_id,
                tank_id: primaryContainer.is_incubator || primaryContainer.is_refrigerator
                    ? null
                    : primaryContainer.tank_id,
                incubator_id: primaryContainer.is_incubator
                    ? (primaryContainer.incubator_id ?? null)
                    : null,
                chamber_id: primaryContainer.is_incubator ? (selectedChamberId ?? null) : null,
                refrigerator_id: primaryContainer.is_refrigerator
                    ? (primaryContainer.refrigerator_id ?? null)
                    : null,
                kpi_name: (formPayload.kpi_name ?? "").trim(),
                alert_name: formPayload.alert_name ?? null,
                min: formPayload.min ?? null,
                max: formPayload.max ?? null,
                unit: formPayload.unit ?? null,
                alert_type: formPayload.alert_type ?? null,
                cooldown_minutes: formPayload.cooldown_minutes ?? 60,
                status: isActiveAlertType(formPayload.alert_type ?? null),
            };
            await ivfService.createKpiConfig(payload);
            closeForm();
            await refetchForPrimary(primaryContainer, {
                showLoading: true,
                chamberId: selectedChamberId,
                zoneId: selectedZoneId,
            });
        } catch (e: any) {
            setFormError(e?.message || "Create failed");
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (editingId == null || !validateForm()) return;
        setSubmitLoading(true);
        try {
            await ivfService.updateKpiConfig(editingId, {
                kpi_name: (formPayload.kpi_name ?? "").trim(),
                alert_name: formPayload.alert_name ?? null,
                min: formPayload.min ?? null,
                max: formPayload.max ?? null,
                unit: formPayload.unit ?? null,
                alert_type: formPayload.alert_type ?? null,
                cooldown_minutes: formPayload.cooldown_minutes ?? undefined,
                status: isActiveAlertType(formPayload.alert_type ?? null),
            });
            closeForm();
            if (primaryContainer) {
                await refetchForPrimary(primaryContainer, {
                    showLoading: true,
                    chamberId: selectedChamberId,
                    zoneId: selectedZoneId,
                });
            }
        } catch (e: any) {
            setFormError(e?.message || "Update failed");
        } finally {
            setSubmitLoading(false);
        }
    };

    const closeDeleteConfirm = () => {
        if (!deleteLoading) {
            setShowDeleteConfirm(false);
            setConfigToDeleteId(null);
        }
    };

    const alertTypeOptions = [
        { value: null as string | null, label: "Alert Disabled" },
        { value: "no_alert", label: "No Alert" },
        { value: "soft", label: "Soft Alert" },
        { value: "critical", label: "Critical Alert" },
    ];

    const getDraft = (id: number) => draftConfig[id] ?? {};
    const setDraft = (
        id: number,
        patch: {
            min?: number | null;
            max?: number | null;
            alert_type?: string | null;
            lid_state?: string;
            cooldown_minutes?: number;
            unack_escalation_threshold?: number | null;
        },
    ) => {
        setDraftConfig((prev) => {
            const next = { ...prev };
            const current = next[id] ?? {};
            const merged = { ...current, ...patch };
            if (Object.keys(merged).length === 0) delete next[id];
            else next[id] = merged;
            return next;
        });
    };

    // Clear draft for single container mode
    const clearDraft = (id: number) => {
        setDraftConfig((prev) => {
            const next = { ...prev };
            next[id] = {
                min: null,
                max: null,
                alert_type: null,
                lid_state: "",
                cooldown_minutes: 60,
            };
            return next;
        });
    };

    // Multi-container draft helpers (keyed by kpi_name)
    const getMultiDraft = (kpiName: string) => multiDraftConfig[kpiName] ?? {};
    const setMultiDraft = (
        kpiName: string,
        patch: {
            min?: number | null;
            max?: number | null;
            alert_type?: string | null;
            lid_state?: string;
            cooldown_minutes?: number;
            unack_escalation_threshold?: number | null;
        },
    ) => {
        setMultiDraftConfig((prev) => {
            const next = { ...prev };
            const current = next[kpiName] ?? {};
            const merged = { ...current, ...patch };
            if (Object.keys(merged).length === 0) delete next[kpiName];
            else next[kpiName] = merged;
            return next;
        });
    };

    // Clear multi-draft for a KPI
    const clearMultiDraft = (kpiName: string) => {
        setMultiDraftConfig((prev) => {
            const next = { ...prev };
            next[kpiName] = {
                min: null,
                max: null,
                alert_type: null,
                lid_state: "",
                cooldown_minutes: 60,
            };
            return next;
        });
    };

    const handleSaveAll = async () => {
        const useMultiFlow =
            selectedContainers.length > 1 || configList.length === 0;
        if (useMultiFlow) {
            // For multi-container OR single container with no existing config: use multiDraftConfig to build configs for all KPIs that have values
            const configsToApply: Array<{
                kpi_name: string;
                alert_name: string | null;
                min: number | null;
                max: number | null;
                unit: string | null;
                alert_type: string | null;
                cooldown_minutes?: number;
                unack_escalation_threshold?: number | null;
                status?: boolean;
            }> = [];
            for (const kpiName of effectiveKpiNames) {
                const d = getMultiDraft(kpiName);
                const metadata = getKpiMetadata(kpiName);
                const cfg = getKpiFormConfig(kpiName);

                let minVal = d.min ?? null;
                let maxVal = d.max ?? null;

                if (cfg.max_bound !== null && minVal !== null) {
                    maxVal = cfg.max_bound;  // battery: max is always the hard ceiling
                }
                if (!cfg.max_available && cfg.max_bound === null) {
                    maxVal = null;  // ln2_level: no max
                }
                if (cfg.custom_dropdown && d.lid_state) {
                    const values = lidStateToValues(d.lid_state);
                    minVal = values.min;
                    maxVal = values.max;
                }

                if (
                    minVal !== null ||
                    maxVal !== null ||
                    d.alert_type !== undefined
                ) {
                    configsToApply.push({
                        kpi_name: kpiName,
                        alert_name:
                            kpiName === KPI_NAMES.IVF_LN2_LEVEL
                                ? "LN2"
                                : metadata.label,
                        min: minVal,
                        max: maxVal,
                        unit: metadata.unit ?? null,
                        alert_type: d.alert_type ?? null,
                        cooldown_minutes: d.cooldown_minutes,
                        unack_escalation_threshold: d.alert_type === "critical" ? (d.unack_escalation_threshold ?? null) : null,
                        status: isActiveAlertType(d.alert_type ?? null),
                    });
                }
            }

            // Renaming a zone that has no KPI config rows yet: zone names are stored
            // on those rows, so scaffold the refrigerator's KPIs (disabled, no
            // thresholds) to give the new zone name somewhere to persist.
            if (
                zoneNameDirty &&
                primaryContainer?.is_refrigerator &&
                configsToApply.length === 0
            ) {
                for (const kpiName of effectiveKpiNames) {
                    const metadata = getKpiMetadata(kpiName);
                    configsToApply.push({
                        kpi_name: kpiName,
                        alert_name: metadata.label,
                        min: null,
                        max: null,
                        unit: metadata.unit ?? null,
                        alert_type: null,
                        status: false,
                    });
                }
            }

            if (configsToApply.length === 0) return;

            setSaveAllLoading(true);
            try {
                if (primaryContainer?.is_refrigerator) {
                    await ivfService.bulkUpsertKpiConfigForRefrigerator(
                        primaryContainer.refrigerator_id ?? primaryContainer.tank_id,
                        selectedZoneId,
                        configsToApply,
                        effectiveZoneName,
                    );
                } else if (primaryContainer?.is_incubator) {
                    await ivfService.bulkUpsertKpiConfigForIncubator(
                        primaryContainer.incubator_id ?? primaryContainer.tank_id,
                        selectedChamberId,
                        configsToApply,
                    );
                } else {
                    const tankIds = selectedContainers.map((c) => c.tank_id);
                    await ivfService.bulkUpsertKpiConfig(tankIds, configsToApply);
                }
                setMultiDraftConfig({});
                // Re-sync zone names after a refrigerator save (zone_name label may have changed).
                if (primaryContainer?.is_refrigerator) {
                    const refId = primaryContainer.refrigerator_id ?? primaryContainer.tank_id;
                    const freshZones = await ivfService.getRefrigeratorZones(refId).catch(() => refrigeratorZones);
                    setRefrigeratorZones(freshZones);
                }
                // For multi-container, deselect all. For single container, reload config.
                if (selectedContainers.length > 1) {
                    await refetchForPrimary(selectedContainers[0], {
                        showLoading: true,
                        chamberId: selectedChamberId,
                        zoneId: selectedZoneId,
                    });
                    setSelectedContainers([]);
                } else if (primaryContainer) {
                    await refetchForPrimary(primaryContainer, {
                        showLoading: true,
                        chamberId: selectedChamberId,
                        zoneId: selectedZoneId,
                    });
                }
                toast.success("Changes saved successfully");
            } catch (e: any) {
                setConfigError(e?.message || "Save failed");
            } finally {
                setSaveAllLoading(false);
            }
            return;
        }
        const ids = Object.keys(draftConfig).map(Number);
        const hasTemplateDrafts = Object.keys(multiDraftConfig).length > 0;
        if (ids.length === 0 && !hasTemplateDrafts && !zoneNameDirty) return;
        setSaveAllLoading(true);
        try {
            // Persist a zone rename: re-upsert the zone's existing configs (unchanged
            // values) carrying the new zone_name. Runs before the per-id updates below,
            // which don't touch zone_name, so threshold edits aren't clobbered.
            if (zoneNameDirty && primaryContainer?.is_refrigerator) {
                await ivfService.bulkUpsertKpiConfigForRefrigerator(
                    primaryContainer.refrigerator_id ?? primaryContainer.tank_id,
                    selectedZoneId,
                    configList.map((c) => ({
                        kpi_name: c.kpi_name,
                        alert_name: c.alert_name,
                        min: c.min,
                        max: c.max,
                        unit: c.unit,
                        alert_type: c.alert_type,
                        cooldown_minutes: c.cooldown_minutes,
                        unack_escalation_threshold: c.unack_escalation_threshold,
                        status: c.status,
                    })),
                    effectiveZoneName,
                );
            }
            for (const id of ids) {
                const d = draftConfig[id];
                if (!d) continue;

                // Find the KPI name for this config id to apply special logic
                const config = configList.find((c) => c.id === id);
                const kpiName = config?.kpi_name || "";
                const cfg = getKpiFormConfig(kpiName);

                let minVal = d.min !== undefined ? d.min : undefined;
                let maxVal = d.max !== undefined ? d.max : undefined;

                if (cfg.max_bound !== null && minVal !== undefined && minVal !== null) {
                    maxVal = cfg.max_bound;  // battery: max is always the hard ceiling
                }
                if (!cfg.max_available && cfg.max_bound === null) {
                    maxVal = null;  // ln2_level: no max
                }
                if (cfg.custom_dropdown && d.lid_state !== undefined) {
                    const values = lidStateToValues(d.lid_state || null);
                    minVal = values.min;
                    maxVal = values.max;
                }

                const nextAlertType =
                    d.alert_type !== undefined
                        ? d.alert_type
                        : config?.alert_type ?? null;

                await ivfService.updateKpiConfig(id, {
                    min: minVal,
                    max: maxVal,
                    alert_type: nextAlertType,
                    cooldown_minutes:
                        d.cooldown_minutes !== undefined
                            ? d.cooldown_minutes
                            : undefined,
                    unack_escalation_threshold: nextAlertType === "critical" ? (d.unack_escalation_threshold ?? null) : null,
                    status: isActiveAlertType(nextAlertType),
                });
            }
            if (primaryContainer && hasTemplateDrafts) {
                const configsToApply: Array<{
                    kpi_name: string;
                    alert_name: string | null;
                    min: number | null;
                    max: number | null;
                    unit: string | null;
                    alert_type: string | null;
                    cooldown_minutes?: number;
                    unack_escalation_threshold?: number | null;
                    status?: boolean;
                }> = [];

                for (const kpiName of missingKpiNames) {
                    const d = getMultiDraft(kpiName);
                    const metadata = getKpiMetadata(kpiName);
                    const cfg = getKpiFormConfig(kpiName);

                    let minVal = d.min ?? null;
                    let maxVal = d.max ?? null;

                    if (cfg.max_bound !== null && minVal !== null) {
                        maxVal = cfg.max_bound;
                    }
                    if (!cfg.max_available && cfg.max_bound === null) {
                        maxVal = null;
                    }
                    if (cfg.custom_dropdown && d.lid_state) {
                        const values = lidStateToValues(d.lid_state);
                        minVal = values.min;
                        maxVal = values.max;
                    }

                    if (
                        minVal !== null ||
                        maxVal !== null ||
                        d.alert_type !== undefined
                    ) {
                        configsToApply.push({
                            kpi_name: kpiName,
                            alert_name:
                                kpiName === KPI_NAMES.IVF_LN2_LEVEL
                                    ? "LN2"
                                    : metadata.label,
                            min: minVal,
                            max: maxVal,
                            unit: metadata.unit ?? null,
                            alert_type: d.alert_type ?? null,
                            cooldown_minutes: d.cooldown_minutes,
                            unack_escalation_threshold: d.alert_type === "critical" ? (d.unack_escalation_threshold ?? null) : null,
                            status: isActiveAlertType(d.alert_type ?? null),
                        });
                    }
                }

                if (configsToApply.length > 0) {
                    if (primaryContainer.is_refrigerator) {
                        await ivfService.bulkUpsertKpiConfigForRefrigerator(
                            primaryContainer.refrigerator_id ?? primaryContainer.tank_id,
                            selectedZoneId,
                            configsToApply,
                            effectiveZoneName,
                        );
                    } else if (primaryContainer.is_incubator) {
                        await ivfService.bulkUpsertKpiConfigForIncubator(
                            primaryContainer.incubator_id ?? primaryContainer.tank_id,
                            selectedChamberId,
                            configsToApply,
                        );
                    } else {
                        await ivfService.bulkUpsertKpiConfig([primaryContainer.tank_id], configsToApply);
                    }
                }
            }
            setDraftConfig({});
            setMultiDraftConfig({});
            // Re-sync zone names after refrigerator save (zone_name label may have changed).
            if (primaryContainer?.is_refrigerator) {
                const refId = primaryContainer.refrigerator_id ?? primaryContainer.tank_id;
                const freshZones = await ivfService.getRefrigeratorZones(refId).catch(() => refrigeratorZones);
                setRefrigeratorZones(freshZones);
            }
            if (primaryContainer) {
                await refetchForPrimary(primaryContainer, {
                    showLoading: true,
                    chamberId: selectedChamberId,
                    zoneId: selectedZoneId,
                });
            }
            toast.success("Changes saved successfully");
        } catch (e: any) {
            setConfigError(e?.message || "Save failed");
        } finally {
            setSaveAllLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (configToDeleteId == null) return;
        setDeleteLoading(true);
        try {
            await ivfService.deleteKpiConfig(configToDeleteId);
            closeDeleteConfirm();
            if (primaryContainer) {
                await refetchForPrimary(primaryContainer, {
                    showLoading: true,
                    chamberId: selectedChamberId,
                    zoneId: selectedZoneId,
                });
            }
        } catch (e: any) {
            setConfigError(e?.message || "Delete failed");
        } finally {
            setDeleteLoading(false);
        }
    };

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

    const handleSelectNotificationChannel = (
        channel: "email" | "whatsapp",
        enabled: boolean,
    ) => {
        setNotifySettings((prev) =>
            channel === "email"
                ? { ...prev, is_email_notifify: enabled }
                : { ...prev, is_whatsapp_notify: enabled },
        );
        setNotifySettingsError(null);
    };

    const handleSaveNotifySettings = async () => {
        if (
            !notifySettings.is_email_notifify &&
            !notifySettings.is_whatsapp_notify
        ) {
            setNotifySettingsError("Enable at least one notification channel");
            return;
        }
        setNotifySettingsSaving(true);
        setNotifySettingsError(null);
        try {
            await ivfService.updateHospitalNotificationSettings({
                is_email_notifify: notifySettings.is_email_notifify,
                is_whatsapp_notify: notifySettings.is_whatsapp_notify,
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

    const isMultiMode =
        selectedContainers.length > 1 || configList.length === 0;
    const hasPendingChanges =
        (isMultiMode
            ? Object.keys(multiDraftConfig).length > 0
            : Object.keys(draftConfig).length > 0 ||
              Object.keys(multiDraftConfig).length > 0) || zoneNameDirty;

    // ─── Shared input renderer driven by KPI_FORM_CONFIG ─────────────────────
    const renderKpiInputs = (
        kpiName: string,
        minVal: number | null,
        maxVal: number | null,
        lidStateVal: string,
        kpiKey: string,
        refs: { min?: HTMLInputElement | HTMLSelectElement | null; max?: HTMLInputElement | null },
        onMin: (v: number | null) => void,
        onMax: (v: number | null) => void,
        onLid: (v: string) => void,
    ) => {
        const cfg = getKpiFormConfig(kpiName);
        const dropdownKey = `lid-${kpiKey}`;

        if (cfg.custom_dropdown) {
            return (
                <div className="flex items-center gap-2">
                    <div className="relative w-64">
                        <button
                            type="button"
                            className="dropdown-button w-full px-3 h-10 border border-gray-200 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary-muted focus:border-transparent bg-white text-gray-900"
                            onClick={() => setOpenDropdowns((prev) => ({ ...prev, [dropdownKey]: !prev[dropdownKey] }))}
                        >
                            <span>{cfg.custom_dropdown.find((o) => o.value === lidStateVal)?.label || "Select"}</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[dropdownKey] ? "rotate-180" : ""}`} />
                        </button>
                        {openDropdowns[dropdownKey] && (
                            <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                {cfg.custom_dropdown.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${opt.value === lidStateVal ? "bg-gray-200 text-gray-900" : "text-gray-700 hover:bg-gray-100"}`}
                                        onClick={() => {
                                            onLid(opt.value);
                                            setOpenDropdowns((prev) => ({ ...prev, [dropdownKey]: false }));
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <>
                {cfg.min_available && (
                    <label className="block min-w-[72px] max-w-[120px] border border-gray-200 rounded-lg px-3 py-1 bg-white cursor-text focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent">
                        <span className="text-xs text-black block">{cfg.min_label ?? "Min"}</span>
                        <div className="flex items-center gap-1">
                            <input
                                ref={(el) => { refs.min = el; }}
                                type="number"
                                step="any"
                                min={cfg.min_bound ?? undefined}
                                max={cfg.max_bound ?? undefined}
                                value={minVal != null ? minVal : ""}
                                onChange={(e) => {
                                    let v = e.target.value === "" ? null : Number(e.target.value);
                                    if (v !== null && cfg.min_bound !== null && v < cfg.min_bound) v = cfg.min_bound;
                                    if (v !== null && cfg.max_bound !== null && v > cfg.max_bound) v = cfg.max_bound;
                                    onMin(v);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, kpiKey, "min")}
                                placeholder={cfg.min_label ?? "Min"}
                                className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent outline-none"
                            />
                            {cfg.unit && <span className="text-sm text-gray-500 shrink-0">{cfg.unit}</span>}
                        </div>
                    </label>
                )}
                {cfg.max_available && (
                    <label className="block min-w-[72px] max-w-[120px] border border-gray-200 rounded-lg px-3 py-1 bg-white cursor-text focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent">
                        <span className="text-xs text-black block">{cfg.max_label ?? "Max"}</span>
                        <div className="flex items-center gap-1">
                            <input
                                ref={(el) => { refs.max = el as HTMLInputElement; }}
                                type="number"
                                step="any"
                                min={cfg.min_bound ?? undefined}
                                value={maxVal != null ? maxVal : ""}
                                onChange={(e) => {
                                    let v = e.target.value === "" ? null : Number(e.target.value);
                                    if (v !== null && cfg.min_bound !== null && v < cfg.min_bound) v = cfg.min_bound;
                                    onMax(v);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, kpiKey, "max")}
                                placeholder={cfg.max_label ?? "Max"}
                                className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent outline-none"
                            />
                            {cfg.unit && <span className="text-sm text-gray-500 shrink-0">{cfg.unit}</span>}
                        </div>
                    </label>
                )}
            </>
        );
    };
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <>
                <PageLayout
                    title="Alert Configuration"
                    description="Set alert thresholds for each device and KPI."
                    icon={CriticalAlertsIcon}
                    patternBackground
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
                                    <div className="absolute top-full mt-2 left-0 w-44 z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
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

                            {/* History pill */}
                            <button
                                type="button"
                                onClick={() => setShowHistory(true)}
                                className="h-9 px-4 rounded-full text-[13px] font-semibold text-white/90 border border-white/15 hover:bg-white/10 flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors max-[490px]:w-full"
                            >
                                <History className="w-3.5 h-3.5" />
                                Config History
                            </button>
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
                                    Tank Monitoring
                                </h2>
                                <div className="flex items-center gap-2">
                                    {(directionFilter === "cryotanks"
                                        ? !primaryContainer || (!primaryContainer.is_incubator && !primaryContainer.is_refrigerator)
                                        : primaryContainer && !primaryContainer.is_incubator && !primaryContainer.is_refrigerator) && (
                                        <div className="relative group hidden md:block">
                                            <button
                                                type="button"
                                                disabled={!primaryContainer}
                                                onClick={() => bentoGridRef.current?.applyRecommended()}
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
        </>
    );
}
