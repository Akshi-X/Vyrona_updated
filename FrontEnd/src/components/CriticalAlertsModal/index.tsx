import React, { useState, useEffect, useRef } from "react";
import AlertCard from "../AlertCard";
import CriticalAlertsIcon from "../../assets/DashBoardIcons/Critical_Alerts.svg";

interface CriticalAlert {
    id: string;
    type: string;
    severity: "Low" | "Medium" | "High" | "Critical";
    patientId: string;
    branchName?: string;
    dedupKey?: string;
    message: string;
    timestamp: string;
    status: "Active" | "Acknowledged" | "Resolved" | "Escalated";
    acknowledgementReason?: string;
}

interface CriticalAlertsModalProps {
    isOpen: boolean;
    onClose: () => void;
    alerts: CriticalAlert[];
    loading?: boolean;
    onAcknowledge?: (alertId: string, reason?: string) => Promise<void>;
    onAcknowledgeAll?: (alertIds: string[], reason?: string) => Promise<void>;
    patientIdLabel?: string;
    id?: string;
}

const CriticalAlertsModal: React.FC<CriticalAlertsModalProps> = ({
    isOpen,
    onClose,
    alerts,
    loading = false,
    onAcknowledge,
    onAcknowledgeAll,
    patientIdLabel = "Tank Code",
    id,
}) => {
    const showPatientId = Boolean(patientIdLabel?.trim());
    const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(
        new Set(),
    );
    const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(
        new Set(),
    );
    const [pendingAcknowledgeAlertIds, setPendingAcknowledgeAlertIds] =
        useState<string[] | null>(null);
    const [isAcknowledgeAllPending, setIsAcknowledgeAllPending] =
        useState(false);
    const [pendingAcknowledgmentReason, setPendingAcknowledgmentReason] =
        useState("");
    // Filter states
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Single filter panel toggle
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const filterPanelRef = useRef<HTMLDivElement | null>(null);

    // Reset filters when modal closes
    useEffect(() => {
        if (!isOpen) {
            setPriorityFilter("all");
            setStatusFilter("all");
            setIsFilterPanelOpen(false);
            setExpandedGroupKeys(new Set());
            setPendingAcknowledgeAlertIds(null);
            setIsAcknowledgeAllPending(false);
            setPendingAcknowledgmentReason("");
        }
    }, [isOpen]);

    // Close filter panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                filterPanelRef.current &&
                !filterPanelRef.current.contains(event.target as Node)
            ) {
                setIsFilterPanelOpen(false);
            }
        };

        if (isFilterPanelOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => {
                document.removeEventListener("mousedown", handleClickOutside);
            };
        }
    }, [isFilterPanelOpen]);

    // Filter alerts
    const visibleAlerts = alerts.filter((alert) => {
        // Apply priority filter (using severity field)
        if (priorityFilter !== "all" && alert.severity !== priorityFilter) {
            return false;
        }
        // Apply status filter
        if (statusFilter !== "all" && alert.status !== statusFilter) {
            return false;
        }
        return true;
    });

    const priorities: ("Low" | "High")[] = ["Low", "High"];
    const statuses: ("Active" | "Acknowledged")[] = ["Active", "Acknowledged"];

    const activeFilterCount =
        (priorityFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

    const handleAcknowledgeRequest = (alertIds: string | string[]) => {
        setPendingAcknowledgeAlertIds(
            Array.isArray(alertIds) ? alertIds : [alertIds],
        );
    };

    const handleAcknowledgeConfirm = async () => {
        const alertIds = pendingAcknowledgeAlertIds;
        if (!alertIds || alertIds.length === 0) return;
        if (!onAcknowledge && !onAcknowledgeAll) return;

        const reason = pendingAcknowledgmentReason.trim() || undefined;
        setAcknowledgingIds((prev) => new Set([...prev, ...alertIds]));
        setPendingAcknowledgeAlertIds(null);
        setPendingAcknowledgmentReason("");
        try {
            if (alertIds.length > 1 && onAcknowledgeAll) {
                await onAcknowledgeAll(alertIds, reason);
            } else if (alertIds.length === 1 && onAcknowledge) {
                await onAcknowledge(alertIds[0], reason);
            } else if (onAcknowledgeAll) {
                await onAcknowledgeAll(alertIds, reason);
            } else {
                await Promise.all(alertIds.map((id) => onAcknowledge!(id, reason)));
            }
        } catch (error) {
            console.error("Error acknowledging alert:", error);
            // You could show a toast notification here
        } finally {
            setAcknowledgingIds((prev) => {
                const next = new Set(prev);
                alertIds.forEach((id) => next.delete(id));
                return next;
            });
        }
    };

    const handleAcknowledgeAllConfirm = async () => {
        if (!onAcknowledge && !onAcknowledgeAll) return;
        const activeAlerts = visibleAlerts.filter((a) => a.status === "Active");
        if (activeAlerts.length === 0) {
            setIsAcknowledgeAllPending(false);
            return;
        }

        const idsToAcknowledge = activeAlerts.map((a) => a.id);
        const reason = pendingAcknowledgmentReason.trim() || undefined;

        setAcknowledgingIds((prev) => new Set([...prev, ...idsToAcknowledge]));
        setIsAcknowledgeAllPending(false);
        setPendingAcknowledgmentReason("");

        try {
            if (onAcknowledgeAll) {
                await onAcknowledgeAll(idsToAcknowledge, reason);
            } else {
                await Promise.all(idsToAcknowledge.map((id) => onAcknowledge!(id, reason)));
            }
        } catch (error) {
            console.error("Error acknowledging alerts:", error);
        } finally {
            setAcknowledgingIds((prev) => {
                const next = new Set(prev);
                idsToAcknowledge.forEach((id) => next.delete(id));
                return next;
            });
        }
    };

    const getDateLabel = (timestamp: string): string => {
        const parsed = new Date(timestamp);
        if (Number.isNaN(parsed.getTime())) {
            return "Unknown Date";
        }

        const itemDate = new Date(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate(),
        );
        const today = new Date();
        const todayDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
        );
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);

        if (itemDate.getTime() === todayDate.getTime()) {
            return "Today";
        }

        if (itemDate.getTime() === yesterdayDate.getTime()) {
            return "Yesterday";
        }

        return itemDate.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    const groupedAlerts = visibleAlerts.reduce<Record<string, CriticalAlert[]>>(
        (acc, alert) => {
            const label = getDateLabel(alert.timestamp);
            if (!acc[label]) {
                acc[label] = [];
            }
            acc[label].push(alert);
            return acc;
        },
        {},
    );

    const parseTimestampValue = (timestamp: string): number => {
        const parsed = new Date(timestamp).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
    };

    const getKpiConfigId = (alert: CriticalAlert): string => {
        const rawDedupKey = alert.dedupKey?.trim();
        if (!rawDedupKey) {
            return alert.id;
        }

        const parts = rawDedupKey.split(":");
        const lastPart = parts[parts.length - 1]?.trim();
        return lastPart || alert.id;
    };

    const getTankGroupId = (alert: CriticalAlert): string => {
        const rawDedupKey = alert.dedupKey?.trim();
        if (rawDedupKey) {
            const parts = rawDedupKey.split(":");
            const firstPart = parts[0]?.trim();
            if (firstPart) {
                return firstPart;
            }
        }

        return alert.patientId?.trim() || alert.id;
    };

    const getAcknowledgementGroupId = (alert: CriticalAlert): string =>
        alert.status === "Acknowledged" ? "acknowledged" : "active";

    let firstActiveGroupKey: string | undefined;
    outerLoop: for (const dateGroups of Object.values(groupedAlerts)) {
        for (const alert of dateGroups) {
            if (alert.status === "Active") {
                const tankGroupId = getTankGroupId(alert);
                const kpiConfigId = getKpiConfigId(alert);
                const label = getDateLabel(alert.timestamp);
                firstActiveGroupKey = `${label}__${tankGroupId}__${kpiConfigId}__active`;
                break outerLoop;
            }
        }
    }

    const groupedByDateAndKpi = Object.entries(groupedAlerts).reduce<
        Record<
            string,
            {
                groupKey: string;
                tankGroupId: string;
                kpiConfigId: string;
                acknowledgementGroupId: string;
                alerts: CriticalAlert[];
            }[]
        >
    >((acc, [dateLabel, dateAlerts]) => {
        const groupedMap = dateAlerts.reduce<Record<string, CriticalAlert[]>>(
            (inner, alert) => {
                const tankGroupId = getTankGroupId(alert);
                const kpiConfigId = getKpiConfigId(alert);
                const acknowledgementGroupId = getAcknowledgementGroupId(alert);
                const compositeGroupId = `${tankGroupId}__${kpiConfigId}__${acknowledgementGroupId}`;
                if (!inner[compositeGroupId]) {
                    inner[compositeGroupId] = [];
                }
                inner[compositeGroupId].push(alert);
                return inner;
            },
            {},
        );

        const groups = Object.entries(groupedMap).map(
            ([compositeGroupId, kpiAlerts]) => {
                const sortedAlerts = [...kpiAlerts].sort(
                    (a, b) =>
                        parseTimestampValue(b.timestamp) -
                        parseTimestampValue(a.timestamp),
                );
                const [
                    tankGroupId = "",
                    kpiConfigId = "",
                    acknowledgementGroupId = "",
                ] =
                    compositeGroupId.split("__");
                return {
                    groupKey: `${dateLabel}__${compositeGroupId}`,
                    tankGroupId,
                    kpiConfigId,
                    acknowledgementGroupId,
                    alerts: sortedAlerts,
                };
            },
        );

        groups.sort(
            (a, b) => {
                if (a.acknowledgementGroupId !== b.acknowledgementGroupId) {
                    return a.acknowledgementGroupId === "active" ? -1 : 1;
                }

                return (
                    parseTimestampValue(b.alerts[0]?.timestamp || "") -
                    parseTimestampValue(a.alerts[0]?.timestamp || "")
                );
            },
        );

        acc[dateLabel] = groups;
        return acc;
    }, {});

    const formatAlertTime = (timestamp: string): string => {
        const parsed = new Date(timestamp);
        if (Number.isNaN(parsed.getTime())) {
            return timestamp;
        }

        return parsed.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    };

    const getBranchName = (alert: CriticalAlert): string | undefined => {
        if (alert.branchName && alert.branchName.trim()) {
            return alert.branchName.trim();
        }

        const match = alert.message.match(/in\s+(.+?)\s+branch/i);
        return match?.[1]?.trim();
    };

    const getPatientDisplay = (alert: CriticalAlert): string => {
        const branchName = getBranchName(alert);
        if (branchName) {
            return `${alert.patientId} (${branchName})`;
        }
        return alert.patientId;
    };

    const isLidStateAlert = (alert: CriticalAlert) =>
        /\bis (OPEN|CLOSED) in .+ branch for .+ tank/i.test(alert.message);

    const isHighSeverity = (severity: CriticalAlert["severity"]) =>
        severity === "High" || severity === "Critical";

    const getSeverityCardClass = (severity: CriticalAlert["severity"]) => {
        if (isHighSeverity(severity)) {
            return "border-red-200 bg-white [background-image:linear-gradient(135deg,rgba(248,113,113,0.14)_0%,rgba(255,255,255,0.92)_52%,rgba(255,255,255,1)_100%)]";
        }
        return "border-orange-200 bg-white [background-image:linear-gradient(135deg,rgba(251,146,60,0.14)_0%,rgba(255,255,255,0.92)_52%,rgba(255,255,255,1)_100%)]";
    };

    const getSeverityIcon = (severity: CriticalAlert["severity"]) => {
        if (isHighSeverity(severity)) {
            return (
                <div className="hidden md:flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">
                    <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                        />
                    </svg>
                </div>
            );
        }

        return (
            <div className="hidden md:flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            </div>
        );
    };

    const toggleGroupExpansion = (groupKey: string) => {
        setExpandedGroupKeys((prev) => {
            const next = new Set(prev);
            if (next.has(groupKey)) {
                next.delete(groupKey);
            } else {
                next.add(groupKey);
            }
            return next;
        });
    };

    const filterHeaderAction = (
        <div className="flex items-center gap-3">
            {(onAcknowledge || onAcknowledgeAll) &&
                visibleAlerts.some((a) => a.status === "Active") && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsAcknowledgeAllPending(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-full bg-primary text-white hover:bg-[#5a0f66] transition-colors shadow-sm"
                    >
                        Acknowledge All
                    </button>
                )}
            <div className="relative" ref={filterPanelRef}>
                {/* Filter icon button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsFilterPanelOpen((prev) => !prev);
                    }}
                    className={`relative p-2 rounded-full transition-colors ${
                        isFilterPanelOpen || activeFilterCount > 0
                            ? "bg-[#f0d6f5] text-primary"
                            : "hover:bg-gray-100 text-gray-500"
                    }`}
                    title="Filter alerts"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                        />
                    </svg>
                    {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                {/* Filter dropdown panel */}
                {isFilterPanelOpen && (
                    <div className="absolute right-0 top-full mt-2 z-[102] bg-white border border-[#e7c6ec] rounded-xl shadow-xl p-4 min-w-[260px]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-primary">
                                Filters
                            </span>
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={() => {
                                        setPriorityFilter("all");
                                        setStatusFilter("all");
                                    }}
                                    className="text-xs text-gray-400 hover:text-primary transition-colors"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>

                        {/* Priority */}
                        <div className="mb-3">
                            <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                                Priority
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {(["all", ...priorities] as string[]).map(
                                    (p) => (
                                        <button
                                            key={p}
                                            onClick={() => setPriorityFilter(p)}
                                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                                priorityFilter === p
                                                    ? "bg-primary text-white"
                                                    : "bg-[#f5f5f5] text-[#555] hover:bg-[#f0d6f5] hover:text-primary"
                                            }`}
                                        >
                                            {p === "all" ? "All" : p}
                                        </button>
                                    ),
                                )}
                            </div>
                        </div>

                        {/* Status */}
                        <div>
                            <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                                Status
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {(["all", ...statuses] as string[]).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                            statusFilter === s
                                                ? "bg-primary text-white"
                                                : "bg-[#f5f5f5] text-[#555] hover:bg-[#f0d6f5] hover:text-primary"
                                        }`}
                                    >
                                        {s === "all" ? "All" : s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <AlertCard
            isOpen={isOpen}
            onClose={onClose}
            title="Critical Alerts"
            description="Review critical alerts that require immediate attention"
            containerClassName="w-full max-w-[750px]"
            contentHeightClassName="md:h-[520px]"
            icon={
                <img
                    src={CriticalAlertsIcon}
                    alt="Critical Alerts"
                    className="w-[24px] h-[24px]"
                />
            }
            loading={loading}
            id={id}
            loadingText="Loading alerts..."
            emptyText="No critical alerts found"
            dataLength={Math.max(visibleAlerts.length, 1)}
            headerAction={filterHeaderAction}
        >
            <div className="space-y-4">
                {visibleAlerts.length === 0 && (
                    <div className="bg-white p-[15px] text-center text-gray-500 text-sm rounded-xl">
                        No alerts match the current filters
                    </div>
                )}

                {Object.entries(groupedByDateAndKpi).map(
                    ([dateLabel, dateGroups]) => (
                        <div key={dateLabel} className="space-y-2">
                            <div className="inline-flex items-center rounded-full bg-[#f0f0f0] px-3 py-1 text-sm font-medium text-[#3a3a3a]">
                                {dateLabel}
                            </div>

                            <div className="space-y-2">
                                {dateGroups.map((group) => {
                                    const latestAlert = group.alerts[0];
                                    const olderAlerts = group.alerts.slice(1);
                                    const hiddenCount = olderAlerts.length;
                                    const activeGroupAlertIds = group.alerts
                                        .filter(
                                            (alert) =>
                                                alert.status === "Active",
                                        )
                                        .map((alert) => alert.id);
                                    const isAcknowledgingGroup =
                                        activeGroupAlertIds.length > 0 &&
                                        activeGroupAlertIds.every((id) =>
                                            acknowledgingIds.has(id),
                                        );
                                    const isLidStateGroup = isLidStateAlert(latestAlert);
                                    const isExpanded = expandedGroupKeys.has(
                                        group.groupKey,
                                    );

                                    if (!latestAlert) {
                                        return null;
                                    }

                                    return (
                                        <div
                                            key={group.groupKey}
                                            className={`rounded-xl border p-4 ${getSeverityCardClass(latestAlert.severity)} ${hiddenCount > 0 ? "cursor-pointer" : ""}`}
                                            onClick={
                                                hiddenCount > 0
                                                    ? () =>
                                                          toggleGroupExpansion(
                                                              group.groupKey,
                                                          )
                                                    : undefined
                                            }
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
                                                {/* Icon — top on mobile, inline on desktop */}
                                                <div className="flex items-center gap-2 md:hidden">
                                                    <div className="flex flex-col items-center">
                                                        {getSeverityIcon(latestAlert.severity)}
                                                        {hiddenCount > 0 && !isExpanded && (
                                                            <span className="mt-1 text-[11px] font-semibold text-primary">+{hiddenCount}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex min-w-0 items-start gap-3 text-left flex-1">
                                                    <div className="hidden md:flex flex-col items-center">
                                                        {getSeverityIcon(
                                                            latestAlert.severity,
                                                        )}
                                                        {hiddenCount > 0 &&
                                                            !isExpanded && (
                                                                <span className="mt-1 text-[11px] font-semibold text-primary">
                                                                    +
                                                                    {
                                                                        hiddenCount
                                                                    }
                                                                </span>
                                                            )}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <h4 className="text-base font-semibold leading-5 tracking-wide text-[#1f2937]">
                                                                {
                                                                    latestAlert.type
                                                                }
                                                            </h4>
                                                            <span
                                                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                                    latestAlert.severity ===
                                                                        "Critical" ||
                                                                    latestAlert.severity ===
                                                                        "High"
                                                                        ? "bg-red-50 text-red-700"
                                                                        : latestAlert.severity ===
                                                                            "Low"
                                                                          ? "bg-orange-50 text-orange-700"
                                                                          : "bg-orange-50 text-orange-700"
                                                                }`}
                                                            >
                                                                {
                                                                    latestAlert.severity
                                                                }
                                                            </span>
                                                            <span
                                                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                                    activeGroupAlertIds.length >
                                                                    0
                                                                        ? "bg-green-50 text-green-700"
                                                                        : "bg-gray-100 text-gray-600"
                                                                }`}
                                                            >
                                                                {activeGroupAlertIds.length >
                                                                0
                                                                    ? "Active"
                                                                    : "Acknowledged"}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 text-sm text-[#333333]">
                                                            {
                                                                latestAlert.message
                                                            }
                                                        </div>
                                                        {showPatientId && (
                                                            <>
                                                                <div className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-[#333333]">
                                                                    <span className="font-semibold text-primary">
                                                                        {
                                                                            patientIdLabel
                                                                        }
                                                                        :
                                                                    </span>{" "}
                                                                    <span className="font-semibold text-[#1f2937] tracking-wide">
                                                                        {getPatientDisplay(
                                                                            latestAlert,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div className="mt-1 text-xs text-gray-500">
                                                                    {formatAlertTime(
                                                                        latestAlert.timestamp,
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                        {!showPatientId && (
                                                            <div className="mt-2 text-xs text-gray-500">
                                                                {formatAlertTime(
                                                                    latestAlert.timestamp,
                                                                )}
                                                            </div>
                                                        )}
                                                        {activeGroupAlertIds.length === 0 &&
                                                            isLidStateAlert(latestAlert) &&
                                                            latestAlert.acknowledgementReason && (
                                                                <div className="mt-2 flex flex-wrap items-start gap-x-1 text-xs text-gray-500">
                                                                    <span className="font-semibold text-gray-600">Reason:</span>
                                                                    <span>{latestAlert.acknowledgementReason}</span>
                                                                </div>
                                                            )}
                                                    </div>
                                                </div>

                                                {/* Acknowledge — right on desktop */}
                                                <div className="hidden md:flex items-center gap-2">
                                                    {hiddenCount > 0 && (
                                                        <div className="p-2" title={isExpanded ? "Collapse older alerts" : "Show older alerts"}>
                                                            <svg className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    {(onAcknowledge || onAcknowledgeAll) && (
                                                        isLidStateGroup ? (
                                                            latestAlert.status === "Active" ? (
                                                                <button
                                                                    id={group.groupKey === firstActiveGroupKey ? "onboarding-critical-alert-ack-btn" : undefined}
                                                                    onClick={(e) => { e.stopPropagation(); handleAcknowledgeRequest(latestAlert.id); }}
                                                                    disabled={acknowledgingIds.has(latestAlert.id)}
                                                                    className={`px-3 py-1 text-xs font-semibold rounded-4xl transition-colors whitespace-nowrap ${acknowledgingIds.has(latestAlert.id) ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-primary text-white hover:bg-[#5a0f66]"}`}
                                                                >
                                                                    {acknowledgingIds.has(latestAlert.id) ? "Acknowledging..." : "Acknowledge"}
                                                                </button>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">-</span>
                                                            )
                                                        ) : (
                                                            activeGroupAlertIds.length > 0 ? (
                                                                <button
                                                                    id={group.groupKey === firstActiveGroupKey ? "onboarding-critical-alert-ack-btn" : undefined}
                                                                    onClick={(e) => { e.stopPropagation(); handleAcknowledgeRequest(activeGroupAlertIds); }}
                                                                    disabled={isAcknowledgingGroup}
                                                                    className={`px-3 py-1 text-xs font-semibold rounded-4xl transition-colors whitespace-nowrap ${isAcknowledgingGroup ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-primary text-white hover:bg-[#5a0f66]"}`}
                                                                >
                                                                    {isAcknowledgingGroup ? "Acknowledging..." : "Acknowledge"}
                                                                </button>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">-</span>
                                                            )
                                                        )
                                                    )}
                                                </div>
                                            </div>

                                            {/* Acknowledge — bottom on mobile */}
                                            {(onAcknowledge || onAcknowledgeAll) && (
                                                <div className="md:hidden mt-3 flex items-center justify-between gap-2">
                                                    {hiddenCount > 0 && (
                                                        <div className="p-1" title={isExpanded ? "Collapse older alerts" : "Show older alerts"}>
                                                            <svg className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    {isLidStateGroup ? (
                                                        latestAlert.status === "Active" ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleAcknowledgeRequest(latestAlert.id); }}
                                                                disabled={acknowledgingIds.has(latestAlert.id)}
                                                                className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors ${acknowledgingIds.has(latestAlert.id) ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-primary text-white hover:bg-[#5a0f66]"}`}
                                                            >
                                                                {acknowledgingIds.has(latestAlert.id) ? "Acknowledging..." : "Acknowledge"}
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">Already acknowledged</span>
                                                        )
                                                    ) : (
                                                        activeGroupAlertIds.length > 0 ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleAcknowledgeRequest(activeGroupAlertIds); }}
                                                                disabled={isAcknowledgingGroup}
                                                                className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors ${isAcknowledgingGroup ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-primary text-white hover:bg-[#5a0f66]"}`}
                                                            >
                                                                {isAcknowledgingGroup ? "Acknowledging..." : "Acknowledge"}
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">Already acknowledged</span>
                                                        )
                                                    )}
                                                </div>
                                            )}

                                            {isExpanded && hiddenCount > 0 && (
                                                <div className="mt-3 border-t border-gray-200/70 pt-3 space-y-3">
                                                    {olderAlerts.map(
                                                        (alert) => (
                                                            <div
                                                                key={alert.id}
                                                                className="flex items-center justify-between gap-3 pl-12"
                                                            >
                                                                <div className="min-w-0 text-left">
                                                                    <div className="text-sm text-[#333333]">
                                                                        {alert.message}
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-gray-500">
                                                                        {formatAlertTime(alert.timestamp)}
                                                                    </div>
                                                                    {isLidStateGroup && alert.status === "Acknowledged" && alert.acknowledgementReason && (
                                                                        <div className="mt-1 flex flex-wrap items-start gap-x-1 text-xs text-gray-500">
                                                                            <span className="font-semibold text-gray-600">Reason:</span>
                                                                            <span>{alert.acknowledgementReason}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {isLidStateGroup && alert.status === "Active" && (onAcknowledge || onAcknowledgeAll) && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleAcknowledgeRequest(alert.id); }}
                                                                        disabled={acknowledgingIds.has(alert.id)}
                                                                        className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-4xl transition-colors whitespace-nowrap ${acknowledgingIds.has(alert.id) ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-primary text-white hover:bg-[#5a0f66]"}`}
                                                                    >
                                                                        {acknowledgingIds.has(alert.id) ? "Acknowledging..." : "Acknowledge"}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ),
                )}
            </div>

            {pendingAcknowledgeAlertIds && (() => {
                const hasPendingLidState = pendingAcknowledgeAlertIds.some(
                    (id) => {
                        const a = alerts.find((a) => a.id === id);
                        return a ? isLidStateAlert(a) : false;
                    },
                );
                const latestLidStateMessage = alerts.find(
                    (a) => pendingAcknowledgeAlertIds.includes(a.id) && isLidStateAlert(a),
                )?.message;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                        <div id="onboarding-critical-alert-confirm-dialog" className="w-full max-w-md rounded-xl bg-white border border-line shadow-xl p-5">
                            <h4 className="text-base font-semibold text-[#1f2937]">
                                {pendingAcknowledgeAlertIds.length > 1
                                    ? "Acknowledge alerts"
                                    : "Acknowledge alert"}
                            </h4>
                            <p className="mt-2 text-sm text-gray-600">
                                {pendingAcknowledgeAlertIds.length > 1
                                    ? `Are you sure you want to acknowledge these ${pendingAcknowledgeAlertIds.length} alerts?`
                                    : "Are you sure you want to acknowledge this alert?"}
                            </p>
                            {hasPendingLidState && (
                                <div className="mt-4">
                                    {latestLidStateMessage && (
                                        <p className="text-xs text-gray-500 mb-2 truncate">
                                            Latest: {latestLidStateMessage}
                                        </p>
                                    )}
                                    <label className="block text-sm font-medium text-[#1f2937] mb-1">
                                        Reason for acknowledgment{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        className="w-full rounded-lg border border-line p-2.5 text-sm text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                                        rows={3}
                                        placeholder="e.g. Lid opened to start thawing for HIS123"
                                        value={pendingAcknowledgmentReason}
                                        onChange={(e) =>
                                            setPendingAcknowledgmentReason(e.target.value)
                                        }
                                    />
                                </div>
                            )}
                            <div className="mt-5 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPendingAcknowledgeAlertIds(null);
                                        setPendingAcknowledgmentReason("");
                                    }}
                                    className="px-4 py-2 text-sm font-medium rounded-lg border border-line text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    id="onboarding-critical-alert-confirm-btn"
                                    type="button"
                                    onClick={handleAcknowledgeConfirm}
                                    disabled={hasPendingLidState && pendingAcknowledgmentReason.trim() === ""}
                                    className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-[#5a0f66] disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                                >
                                    Acknowledge
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {isAcknowledgeAllPending && (() => {
                const hasAcknowledgeAllLidState = visibleAlerts
                    .filter((a) => a.status === "Active")
                    .some(isLidStateAlert);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                        <div className="w-full max-w-md rounded-xl bg-white border border-line shadow-xl p-5">
                            <h4 className="text-base font-semibold text-[#1f2937]">
                                Acknowledge all alerts
                            </h4>
                            <p className="mt-2 text-sm text-gray-600">
                                Are you sure you want to acknowledge all active
                                alerts?
                            </p>
                            {hasAcknowledgeAllLidState && (
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-[#1f2937] mb-1">
                                        Reason for lid state acknowledgment{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        className="w-full rounded-lg border border-line p-2.5 text-sm text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                                        rows={3}
                                        placeholder="e.g. Lid opened to start thawing for HIS123"
                                        value={pendingAcknowledgmentReason}
                                        onChange={(e) =>
                                            setPendingAcknowledgmentReason(e.target.value)
                                        }
                                    />
                                </div>
                            )}
                            <div className="mt-5 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAcknowledgeAllPending(false);
                                        setPendingAcknowledgmentReason("");
                                    }}
                                    className="px-4 py-2 text-sm font-medium rounded-lg border border-line text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAcknowledgeAllConfirm}
                                    disabled={hasAcknowledgeAllLidState && pendingAcknowledgmentReason.trim() === ""}
                                    className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-[#5a0f66] disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                                >
                                    Acknowledge All
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </AlertCard>
    );
};

export default CriticalAlertsModal;
