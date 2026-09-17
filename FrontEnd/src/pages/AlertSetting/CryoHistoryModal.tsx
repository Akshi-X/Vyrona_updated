import { useEffect, useState } from "react";
import { History } from "lucide-react";
import AlertCard from "../../components/AlertCard";
import { activityLogService, type ActivityLogRecord } from "../../services/activityLogService";

const PAGE_SIZE = 25;

const FIELD_LABELS: Record<string, string> = {
    status: "Alerts",
    min: "Min",
    max: "Max",
    whatsapp_alert: "WhatsApp",
    email_alert: "Email",
    cooldown_minutes: "Cooldown",
    unack_escalation_threshold: "Escalation",
};

const formatFieldValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (field === "status" || field === "whatsapp_alert" || field === "email_alert") return value ? "on" : "off";
    return String(value);
};

interface FieldDiff {
    label: string;
    from: string;
    to: string;
}

/** Field-level diffs between a before/after config snapshot. */
const diffFields = (before: Record<string, any> | null | undefined, after: Record<string, any> | null | undefined): FieldDiff[] => {
    if (!after) return [];
    const fields = Object.keys(FIELD_LABELS).filter((f) => f in after);
    if (!before) {
        return fields
            .filter((f) => after[f])
            .map((f) => ({ label: FIELD_LABELS[f], from: "—", to: formatFieldValue(f, after[f]) }));
    }
    return fields
        .filter((f) => before[f] !== after[f])
        .map((f) => ({ label: FIELD_LABELS[f], from: formatFieldValue(f, before[f]), to: formatFieldValue(f, after[f]) }));
};

/** Friendly alert name for a single change entry (e.g. "LN2"), falling back to the raw kpi_name. */
const changeDisplayName = (change: { kpi_name: string; before?: Record<string, any> | null; after?: Record<string, any> | null }): string =>
    change.after?.alert_name || change.before?.alert_name || change.kpi_name;

/** KPI/alert name (or count for multi-KPI entries) shown as the card title. */
const kpiTitle = (log: ActivityLogRecord): string => {
    const md = log.metadata ?? {};
    if (Array.isArray(md.changes) && md.changes.length) {
        return md.changes.length === 1 ? changeDisplayName(md.changes[0]) : `${md.changes.length} KPIs`;
    }
    const alertName = md.after?.alert_name || md.before?.alert_name;
    if (alertName) return alertName;
    const singleKpi = md.after?.kpi_name ?? md.before?.kpi_name ?? (typeof md.kpi_name === "string" ? md.kpi_name : null);
    if (singleKpi) return singleKpi;
    const names = Array.isArray(md.kpi_alert_names) && md.kpi_alert_names.length ? md.kpi_alert_names : md.kpi_names;
    if (Array.isArray(names) && names.length) {
        return names.length === 1 ? names[0] : `${names.length} KPIs`;
    }
    return "Config";
};

/** Created/Updated/Deleted/Copied status pill, colored to match. */
const statusChip = (action: string): { label: string; className: string } =>
    action.endsWith("copied")
        ? { label: "Copied", className: "bg-sky-100 text-sky-700" }
        : action.endsWith("deleted")
            ? { label: "Deleted", className: "bg-rose-100 text-rose-700" }
            : action.endsWith("created")
                ? { label: "Created", className: "bg-emerald-100 text-emerald-700" }
                : { label: "Updated", className: "bg-purple-100 text-purple-700" };

interface ChangeGroup {
    kpiName?: string;
    diffs: FieldDiff[];
}

/** Structured diffs to render as pills; omits the KPI name when the chip already shows it (single-KPI entries). */
const changeGroups = (log: ActivityLogRecord): ChangeGroup[] => {
    const md = log.metadata ?? {};
    if (Array.isArray(md.changes) && md.changes.length) {
        if (md.changes.length === 1) return [{ diffs: diffFields(md.changes[0].before, md.changes[0].after) }];
        return md.changes
            .map((c: any) => ({ kpiName: changeDisplayName(c), diffs: diffFields(c.before, c.after) }))
            .filter((g: ChangeGroup) => g.diffs.length > 0);
    }
    if (md.before || md.after) return [{ diffs: diffFields(md.before, md.after) }];
    return [];
};

/** The source-side "Copied to X, Y" summary row — redundant in an all-devices view where each destination's own row already says "Copied from"; only worth showing when that specific source device's history is open. */
const isOutgoingCopySummary = (log: ActivityLogRecord): boolean =>
    Array.isArray(log.metadata?.copied_to_tank_ids) || Array.isArray(log.metadata?.copied_to_zone_ids);

/** Plain-text fallback when there's nothing to render as diff pills. */
const rowFallbackText = (log: ActivityLogRecord): string => {
    const md = log.metadata ?? {};
    if (typeof md.message === "string" && md.message) return md.message;
    if (Array.isArray(md.changes) && md.changes.length > 1) {
        return `KPIs: ${md.changes.map(changeDisplayName).join(", ")}`;
    }
    const names = Array.isArray(md.kpi_alert_names) && md.kpi_alert_names.length ? md.kpi_alert_names : md.kpi_names;
    if (Array.isArray(names) && names.length > 1) return `KPIs: ${names.join(", ")}`;
    return "";
};

export default function CryoHistoryModal({
    isOpen,
    onClose,
    deviceType = "tank",
    deviceId,
    deviceCode,
    branchName,
    branchDeviceIds,
}: {
    isOpen: boolean;
    onClose: () => void;
    /** Which device kind this history is scoped to. */
    deviceType?: "tank" | "refrigerator";
    /** When set, only this device's history is shown; otherwise all devices of deviceType (or all of branchDeviceIds, if given). */
    deviceId: number | null;
    deviceCode: string | null;
    /** Branch of the selected device, or the active branch filter when no device is selected. */
    branchName?: string | null;
    /** When deviceId is null and branchName is set, restricts the list to these device ids (the branch's devices). */
    branchDeviceIds?: number[] | null;
}) {
    const [logs, setLogs] = useState<ActivityLogRecord[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const deviceNoun = deviceType === "refrigerator" ? "Refrigerator" : "Tank";
    const deviceCodeField = deviceType === "refrigerator" ? "refrigerator_code" : "tank_code";
    // "Cryocan" is the established product term for the tank collection; "Tank" is used per-device.
    const collectionNoun = deviceType === "refrigerator" ? "Refrigerator" : "Cryocan";

    // When scoped to a branch (no specific device), restrict to that branch's devices.
    // An empty branchDeviceIds means the branch has none of this device type — use a sentinel that matches nothing.
    const targetIdsFilter: string[] | undefined =
        deviceId == null && branchDeviceIds != null
            ? branchDeviceIds.length > 0
                ? branchDeviceIds.map(String)
                : ["__none__"]
            : undefined;

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoading(true);
        setLogs([]);
        setPage(1);
        activityLogService
            .getActivityLogs({
                target_type: deviceType,
                action_prefix: "alert_configuration.",
                ...(deviceId != null ? { target_id: String(deviceId) } : {}),
                ...(targetIdsFilter ? { target_ids: targetIdsFilter } : {}),
                page: 1,
                page_size: PAGE_SIZE,
            })
            .then((res) => {
                if (cancelled) return;
                setLogs(deviceId == null ? res.logs.filter((l) => !isOutgoingCopySummary(l)) : res.logs);
                setTotalCount(res.total_count);
            })
            .catch(() => {
                if (!cancelled) setTotalCount(0);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, deviceType, deviceId, branchDeviceIds]);

    const loadMore = () => {
        const nextPage = page + 1;
        setLoadingMore(true);
        activityLogService
            .getActivityLogs({
                target_type: deviceType,
                action_prefix: "alert_configuration.",
                ...(deviceId != null ? { target_id: String(deviceId) } : {}),
                ...(targetIdsFilter ? { target_ids: targetIdsFilter } : {}),
                page: nextPage,
                page_size: PAGE_SIZE,
            })
            .then((res) => {
                const nextLogs = deviceId == null ? res.logs.filter((l) => !isOutgoingCopySummary(l)) : res.logs;
                setLogs((prev) => [...prev, ...nextLogs]);
                setTotalCount(res.total_count);
                setPage(nextPage);
            })
            .finally(() => setLoadingMore(false));
    };

    const scopeLabel = deviceCode
        ? `${branchName ? `${branchName} ` : ""}${deviceCode} ${deviceNoun}`
        : branchName
            ? `All ${branchName} ${deviceNoun}s`
            : `All ${deviceNoun}s`;

    return (
        <AlertCard
            isOpen={isOpen}
            onClose={onClose}
            title={deviceCode ? `Config History — ${deviceNoun} ${deviceCode}` : `${collectionNoun} Config History`}
            description={
                deviceCode
                    ? `Alert configuration changes for this ${deviceNoun.toLowerCase()}`
                    : `Alert configuration changes across all ${collectionNoun.toLowerCase()}s`
            }
            icon={<History className="w-6 h-6 text-primary" />}
            headerAction={
                <span className="hidden sm:inline-flex shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                    {scopeLabel}
                </span>
            }
            containerClassName="w-full max-w-[750px]"
            contentHeightClassName="md:h-[520px]"
            loading={loading}
            loadingText="Loading history..."
            emptyText="No history found"
            dataLength={logs.length}
            thinScrollbar
        >
            <div className="space-y-3 p-4">
                {logs.map((log) => {
                    const status = statusChip(log.action);
                    const groups = changeGroups(log);
                    const fallbackText = groups.length === 0 ? rowFallbackText(log) : "";
                    const deviceCodeLabel = log.target_details?.[deviceCodeField];
                    const branchLabel = log.target_details?.branch_name;
                    const zoneNameLabel: string | null =
                        (typeof log.metadata?.zone_name === "string" && log.metadata.zone_name) ||
                        (typeof log.metadata?.after?.zone_name === "string" && log.metadata.after.zone_name) ||
                        (typeof log.metadata?.before?.zone_name === "string" && log.metadata.before.zone_name) ||
                        null;
                    // Tank copies are labeled "Tank T2 (Branch)" (short codes need the noun + branch, since
                    // source/destination tanks can be in different branches); zone copies just use the zone's
                    // own name (e.g. "Fridge", "Zone 2"), which already reads fine on its own.
                    const copiedFromTankCode = typeof log.metadata?.copied_from_tank_code === "string" ? log.metadata.copied_from_tank_code : null;
                    const copiedFromZoneName = typeof log.metadata?.copied_from_zone_name === "string" ? log.metadata.copied_from_zone_name : null;
                    const copiedFromBranch = typeof log.metadata?.copied_from_tank_branch === "string" ? log.metadata.copied_from_tank_branch : null;
                    const copiedFromLabel = copiedFromTankCode
                        ? `Tank ${copiedFromTankCode}${copiedFromBranch ? ` (${copiedFromBranch})` : ""}`
                        : copiedFromZoneName;
                    const copiedToDestLabel = copiedFromTankCode
                        ? `Tank ${deviceCodeLabel ?? "—"}${branchLabel ? ` (${branchLabel})` : ""}`
                        : zoneNameLabel ?? "—";
                    const rawCopiedToCodes: unknown[] = Array.isArray(log.metadata?.copied_to_tank_codes) ? log.metadata.copied_to_tank_codes : [];
                    const rawCopiedToBranches: unknown[] = Array.isArray(log.metadata?.copied_to_tank_branches) ? log.metadata.copied_to_tank_branches : [];
                    const copiedToCodes: string[] = rawCopiedToCodes.length
                        ? (rawCopiedToCodes
                            .map((c, i) =>
                                typeof c === "string"
                                    ? `Tank ${c}${typeof rawCopiedToBranches[i] === "string" ? ` (${rawCopiedToBranches[i]})` : ""}`
                                    : null,
                            )
                            .filter((c): c is string => c !== null))
                        : Array.isArray(log.metadata?.copied_to_zone_names)
                            ? log.metadata.copied_to_zone_names.filter((c: unknown): c is string => typeof c === "string")
                            : [];
                    return (
                        <div key={log.id} className="rounded-2xl border border-primary/10 bg-primary/[0.03] p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-gray-800">{kpiTitle(log)}</span>
                                        <span className={`inline-flex shrink-0 px-2.5 py-0.5 text-xs font-semibold rounded-full ${status.className}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                    {copiedFromLabel && (
                                        <p className="mt-1 text-xs font-semibold text-sky-700">
                                            Copied from {copiedFromLabel} → {copiedToDestLabel}
                                        </p>
                                    )}
                                    {copiedToCodes.length > 0 && (
                                        <p className="mt-1 text-xs font-semibold text-sky-700">
                                            Copied to {copiedToCodes.join(", ")}
                                        </p>
                                    )}
                                    {groups.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {groups.map((group, gi) =>
                                                group.diffs.map((diff, di) => (
                                                    <div
                                                        key={`${gi}-${di}`}
                                                        className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-xl bg-white border border-primary/15"
                                                    >
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                            {group.kpiName ? `${group.kpiName} · ${diff.label}` : diff.label}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 text-xs">
                                                            <span className="text-gray-400">{diff.from}</span>
                                                            <span className="text-primary">→</span>
                                                            <span className="font-semibold text-gray-800">{diff.to}</span>
                                                        </span>
                                                    </div>
                                                )),
                                            )}
                                        </div>
                                    )}
                                    {fallbackText && <p className="mt-1 text-sm text-gray-500">{fallbackText}</p>}
                                </div>
                                {(deviceCodeLabel || zoneNameLabel) && (
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {deviceCodeLabel && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{deviceNoun}</span>
                                                <span className="text-sm font-semibold text-gray-800">{deviceCodeLabel}</span>
                                            </div>
                                        )}
                                        {zoneNameLabel && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Zone</span>
                                                <span className="text-sm font-semibold text-gray-800">{zoneNameLabel}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 pt-3 border-t border-primary/10 grid grid-cols-3 gap-4">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Changed By</span>
                                    <span className="text-sm font-semibold text-gray-800 truncate">{log.actor_label ?? "System"}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Branch</span>
                                    <span className="text-sm font-semibold text-gray-800 truncate">{branchLabel ?? "—"}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">When</span>
                                    <span className="text-sm font-semibold text-gray-800">
                                        {new Date(log.created_at).toLocaleString("en-GB", {
                                            day: "2-digit",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {logs.length < totalCount && (
                    <div className="flex justify-center py-1">
                        <button
                            type="button"
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="px-4 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                            {loadingMore ? "Loading..." : `Load more (${totalCount - logs.length} left)`}
                        </button>
                    </div>
                )}
            </div>
        </AlertCard>
    );
}
