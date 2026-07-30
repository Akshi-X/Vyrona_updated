import { useEffect, useState } from "react";
import { History } from "lucide-react";
import AlertCard from "../../components/AlertCard";
import { activityLogService, type ActivityLogRecord } from "../../services/activityLogService";

const PAGE_SIZE = 25;

/** Chip label + tone per activity action; falls back to a humanized action string. */
const actionChip = (action: string): { label: string; className: string } => {
    if (action === "alert.created") return { label: "Alert triggered", className: "bg-red-100 text-red-700" };
    if (action.startsWith("alert.acknowledged")) return { label: "Alert acknowledged", className: "bg-green-100 text-green-700" };
    if (action.startsWith("alert_configuration."))
        return {
            label: action.endsWith("deleted") ? "Config deleted" : action.endsWith("created") ? "Config created" : "Config updated",
            className: "bg-purple-100 text-purple-700",
        };
    if (action.startsWith("refill_detection.")) return { label: "Refill detected", className: "bg-blue-100 text-blue-700" };
    return {
        label: action.split(".").pop()?.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) ?? action,
        className: "bg-gray-100 text-gray-700",
    };
};

const rowMessage = (log: ActivityLogRecord): string => {
    const md = log.metadata ?? {};
    if (typeof md.message === "string" && md.message) return md.message;
    if (Array.isArray(md.kpi_names) && md.kpi_names.length) return `KPIs: ${md.kpi_names.join(", ")}`;
    if (typeof md.kpi_name === "string" && md.kpi_name) return `KPI: ${md.kpi_name}`;
    return "";
};

export default function CryoHistoryModal({
    isOpen,
    onClose,
    tankId,
    tankCode,
}: {
    isOpen: boolean;
    onClose: () => void;
    /** When set, only this tank's history is shown; otherwise all cryocans. */
    tankId: number | null;
    tankCode: string | null;
}) {
    const [logs, setLogs] = useState<ActivityLogRecord[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoading(true);
        setLogs([]);
        setPage(1);
        activityLogService
            .getActivityLogs({
                target_type: "tank",
                ...(tankId != null ? { target_id: String(tankId) } : {}),
                page: 1,
                page_size: PAGE_SIZE,
            })
            .then((res) => {
                if (cancelled) return;
                setLogs(res.logs);
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
    }, [isOpen, tankId]);

    const loadMore = () => {
        const nextPage = page + 1;
        setLoadingMore(true);
        activityLogService
            .getActivityLogs({
                target_type: "tank",
                ...(tankId != null ? { target_id: String(tankId) } : {}),
                page: nextPage,
                page_size: PAGE_SIZE,
            })
            .then((res) => {
                setLogs((prev) => [...prev, ...res.logs]);
                setTotalCount(res.total_count);
                setPage(nextPage);
            })
            .finally(() => setLoadingMore(false));
    };

    return (
        <AlertCard
            isOpen={isOpen}
            onClose={onClose}
            title={tankCode ? `History — Tank ${tankCode}` : "Cryocan History"}
            description={
                tankCode
                    ? "Alerts and configuration changes for this tank"
                    : "Alerts and configuration changes across all cryocans"
            }
            icon={<History className="w-6 h-6 text-primary" />}
            containerClassName="w-full max-w-[750px]"
            contentHeightClassName="md:h-[520px]"
            loading={loading}
            loadingText="Loading history..."
            emptyText="No history found"
            dataLength={logs.length}
            thinScrollbar
        >
            <div className="divide-y divide-gray-100">
                {logs.map((log) => {
                    const chip = actionChip(log.action);
                    const message = rowMessage(log);
                    return (
                        <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                            <span className={`inline-flex shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full ${chip.className}`}>
                                {chip.label}
                            </span>
                            <div className="flex-1 min-w-0">
                                {message && <p className="text-sm text-gray-800 break-words">{message}</p>}
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {log.target_label && <span className="font-semibold">Tank {log.target_label} · </span>}
                                    {log.actor_label ?? "System"}
                                </p>
                            </div>
                            <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </span>
                        </div>
                    );
                })}
                {logs.length < totalCount && (
                    <div className="flex justify-center py-3">
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
