import { X, LayoutDashboard, FlaskConical, Thermometer, ClipboardCheck, BarChart2, Bell, Table2, Map, Activity, Zap, Search, AlertTriangle, MessageSquare, MessageCircle, CheckSquare, ClipboardList, type LucideProps } from "lucide-react";
import type { FC } from "react";

const ICON_MAP: Record<string, FC<LucideProps>> = {
    LayoutDashboard,
    FlaskConical,
    Thermometer,
    ClipboardCheck,
    BarChart2,
    Bell,
    Table2,
    Map,
    Activity,
    Zap,
    Search,
    AlertTriangle,
    MessageSquare,
    MessageCircle,
    CheckSquare,
    ClipboardList,
};

interface TourStepHeadingProps {
    title: string;
    icon?: string;
    onClose: () => void;
}

export default function TourStepHeading({ title, icon, onClose }: TourStepHeadingProps) {
    const IconComponent = icon ? ICON_MAP[icon] : undefined;

    return (
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
                {IconComponent && (
                    <IconComponent size={13} className="shrink-0 text-slate-500" strokeWidth={2} />
                )}
                {title && (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400 truncate">
                        {title}
                    </p>
                )}
            </div>
            <button
                type="button"
                onClick={onClose}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title="Minimise tour"
            >
                <X size={12} strokeWidth={2.5} />
            </button>
        </div>
    );
}
