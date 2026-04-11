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
    timestamp: string|Date;
    status: "Active" | "Acknowledged" | "Resolved" | "Escalated";
}

interface CriticalAlertsModalProps {
    isOpen: boolean;
    onClose: () => void;
    alerts: CriticalAlert[];
    loading?: boolean;
    onAcknowledge?: (alertId: string) => Promise<void>;
    patientIdLabel?: string;
}

const CriticalAlertsModal: React.FC<CriticalAlertsModalProps> = ({
    isOpen,
    onClose,
    alerts,
    loading = false,
    onAcknowledge,
    patientIdLabel = "Tank Code",
}) => {
    const showPatientId = Boolean(patientIdLabel?.trim());
    const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(
        new Set(),
    );
    const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(
        new Set(),
    );
    const [pendingAcknowledgeAlertId, setPendingAcknowledgeAlertId] = useState<
        string | null
    >(null);
    const [isAcknowledgeAllPending, setIsAcknowledgeAllPending] =
        useState(false);
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
            setPendingAcknowledgeAlertId(null);
            setIsAcknowledgeAllPending(false);
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

    const handleAcknowledgeRequest = (alertId: string) => {
        setPendingAcknowledgeAlertId(alertId);
    };

    const handleAcknowledgeConfirm = async () => {
        const alertId = pendingAcknowledgeAlertId;
        if (!alertId) return;
        if (!onAcknowledge) return;

        setAcknowledgingIds((prev) => new Set(prev).add(alertId));
        setPendingAcknowledgeAlertId(null);
        try {
            await onAcknowledge(alertId);
        } catch (error) {
            console.error("Error acknowledging alert:", error);
            // You could show a toast notification here
        } finally {
            setAcknowledgingIds((prev) => {
                const next = new Set(prev);
                next.delete(alertId);
                return next;
            });
        }
    };

    const handleAcknowledgeAllConfirm = async () => {
        if (!onAcknowledge) return;
        const activeAlerts = visibleAlerts.filter((a) => a.status === "Active");
        if (activeAlerts.length === 0) {
            setIsAcknowledgeAllPending(false);
            return;
        }

        const idsToAcknowledge = activeAlerts.map((a) => a.id);

        setAcknowledgingIds((prev) => new Set([...prev, ...idsToAcknowledge]));
        setIsAcknowledgeAllPending(false);

        try {
            await Promise.all(idsToAcknowledge.map((id) => onAcknowledge!(id)));
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

    const groupedByDateAndKpi = Object.entries(groupedAlerts).reduce<
        Record<
            string,
            {
                groupKey: string;
                tankGroupId: string;
                kpiConfigId: string;
                alerts: CriticalAlert[];
            }[]
        >
    >((acc, [dateLabel, dateAlerts]) => {
        const groupedMap = dateAlerts.reduce<Record<string, CriticalAlert[]>>(
            (inner, alert) => {
                const tankGroupId = getTankGroupId(alert);
                const kpiConfigId = getKpiConfigId(alert);
                const compositeGroupId = `${tankGroupId}__${kpiConfigId}`;
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
                const [tankGroupId = "", kpiConfigId = ""] =
                    compositeGroupId.split("__");
                return {
                    groupKey: `${dateLabel}__${compositeGroupId}`,
                    tankGroupId,
                    kpiConfigId,
                    alerts: sortedAlerts,
                };
            },
        );

        groups.sort(
            (a, b) =>
                parseTimestampValue(b.alerts[0]?.timestamp || "") -
                parseTimestampValue(a.alerts[0]?.timestamp || ""),
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
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
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
            {onAcknowledge &&
                visibleAlerts.some((a) => a.status === "Active") && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsAcknowledgeAllPending(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-full bg-[#6b1176] text-white hover:bg-[#5a0f66] transition-colors shadow-sm"
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
                            ? "bg-[#f0d6f5] text-[#6b1176]"
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
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#6b1176] text-[9px] font-bold text-white">
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                {/* Filter dropdown panel */}
                {isFilterPanelOpen && (
                    <div className="absolute right-0 top-full mt-2 z-[9999] bg-white border border-[#e7c6ec] rounded-xl shadow-xl p-4 min-w-[260px]">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-[#6b1176]">
                                Filters
                            </span>
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={() => {
                                        setPriorityFilter("all");
                                        setStatusFilter("all");
                                    }}
                                    className="text-xs text-gray-400 hover:text-[#6b1176] transition-colors"
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
                                                    ? "bg-[#6b1176] text-white"
                                                    : "bg-[#f5f5f5] text-[#555] hover:bg-[#f0d6f5] hover:text-[#6b1176]"
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
                                                ? "bg-[#6b1176] text-white"
                                                : "bg-[#f5f5f5] text-[#555] hover:bg-[#f0d6f5] hover:text-[#6b1176]"
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
            icon={
                <img
                    src={CriticalAlertsIcon}
                    alt="Critical Alerts"
                    className="w-[24px] h-[24px]"
                />
            }
            loading={loading}
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
                                                            <span className="mt-1 text-[11px] font-semibold text-[#6b1176]">+{hiddenCount}</span>
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
                                                                <span className="mt-1 text-[11px] font-semibold text-[#6b1176]">
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
                                                                    latestAlert.status ===
                                                                    "Active"
                                                                        ? "bg-green-50 text-green-700"
                                                                        : latestAlert.status ===
                                                                            "Acknowledged"
                                                                          ? "bg-gray-100 text-gray-600"
                                                                          : "bg-gray-100 text-gray-600"
                                                                }`}
                                                            >
                                                                {
                                                                    latestAlert.status
                                                                }
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
                                                                    <span className="font-semibold text-[#6b1176]">
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
                                                    {onAcknowledge && (
                                                        latestAlert.status === "Active" ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleAcknowledgeRequest(latestAlert.id); }}
                                                                disabled={acknowledgingIds.has(latestAlert.id)}
                                                                className={`px-3 py-1 text-xs font-semibold rounded-4xl transition-colors whitespace-nowrap ${acknowledgingIds.has(latestAlert.id) ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-[#6b1176] text-white hover:bg-[#5a0f66]"}`}
                                                            >
                                                                {acknowledgingIds.has(latestAlert.id) ? "Acknowledging..." : "Acknowledge"}
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs">-</span>
                                                        )
                                                    )}
                                                </div>
                                            </div>

                                            {/* Acknowledge — bottom on mobile */}
                                            {onAcknowledge && (
                                                <div className="md:hidden mt-3 flex items-center justify-between gap-2">
                                                    {hiddenCount > 0 && (
                                                        <div className="p-1" title={isExpanded ? "Collapse older alerts" : "Show older alerts"}>
                                                            <svg className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    {latestAlert.status === "Active" ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAcknowledgeRequest(latestAlert.id); }}
                                                            disabled={acknowledgingIds.has(latestAlert.id)}
                                                            className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors ${acknowledgingIds.has(latestAlert.id) ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-[#6b1176] text-white hover:bg-[#5a0f66]"}`}
                                                        >
                                                            {acknowledgingIds.has(latestAlert.id) ? "Acknowledging..." : "Acknowledge"}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">Already acknowledged</span>
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
                                                                        {
                                                                            alert.message
                                                                        }
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-gray-500">
                                                                        {formatAlertTime(
                                                                            alert.timestamp,
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {onAcknowledge && (
                                                                    <>
                                                                        {alert.status ===
                                                                        "Active" ? (
                                                                            <button
                                                                                onClick={(
                                                                                    e,
                                                                                ) => {
                                                                                    e.stopPropagation();
                                                                                    handleAcknowledgeRequest(
                                                                                        alert.id,
                                                                                    );
                                                                                }}
                                                                                disabled={acknowledgingIds.has(
                                                                                    alert.id,
                                                                                )}
                                                                                className={`px-3 py-1 text-xs font-semibold rounded-4xl transition-colors whitespace-nowrap ${
                                                                                    acknowledgingIds.has(
                                                                                        alert.id,
                                                                                    )
                                                                                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                                                                                        : "bg-[#6b1176] text-white hover:bg-[#5a0f66]"
                                                                                }`}
                                                                            >
                                                                                {acknowledgingIds.has(
                                                                                    alert.id,
                                                                                )
                                                                                    ? "Acknowledging..."
                                                                                    : "Acknowledge"}
                                                                            </button>
                                                                        ) : (
                                                                            <span className="text-gray-400 text-xs">
                                                                                -
                                                                            </span>
                                                                        )}
                                                                    </>
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

            {pendingAcknowledgeAlertId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-xl bg-white border border-[#E7E1E1] shadow-xl p-5">
                        <h4 className="text-base font-semibold text-[#1f2937]">
                            Acknowledge alert
                        </h4>
                        <p className="mt-2 text-sm text-gray-600">
                            Are you sure you want to acknowledge this alert?
                        </p>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setPendingAcknowledgeAlertId(null)
                                }
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E7E1E1] text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAcknowledgeConfirm}
                                className="px-4 py-2 text-sm font-medium rounded-lg bg-[#6b1176] text-white hover:bg-[#5a0f66]"
                            >
                                Acknowledge
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAcknowledgeAllPending && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-xl bg-white border border-[#E7E1E1] shadow-xl p-5">
                        <h4 className="text-base font-semibold text-[#1f2937]">
                            Acknowledge all alerts
                        </h4>
                        <p className="mt-2 text-sm text-gray-600">
                            Are you sure you want to acknowledge all active
                            alerts?
                        </p>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setIsAcknowledgeAllPending(false)
                                }
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E7E1E1] text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAcknowledgeAllConfirm}
                                className="px-4 py-2 text-sm font-medium rounded-lg bg-[#6b1176] text-white hover:bg-[#5a0f66]"
                            >
                                Acknowledge All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AlertCard>
    );
};

export default CriticalAlertsModal;
