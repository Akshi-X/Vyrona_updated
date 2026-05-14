import { useState, useRef, useEffect, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTourNavContext } from "../contexts/TourNavContext";

// --- FilterSelect ---
type FilterOption = string | { label: string; value: string };

type FilterSelectProps = {
    label: string;
    value: string;
    onChange: (val: string) => void;
    options: FilterOption[];
    allLabel?: string;
    buttonId?: string;
    listId?: string;
};

const getOptionValue = (o: FilterOption) => typeof o === "string" ? o : o.value;
const getOptionLabel = (o: FilterOption) => typeof o === "string" ? o : o.label;

export const FilterSelect = ({
    label,
    value,
    onChange,
    options,
    allLabel = "All",
    buttonId,
    listId,
}: FilterSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const tourNavCtx = useTourNavContext();

    const selectedLabel = value === "All"
        ? allLabel
        : (options.find((o) => getOptionValue(o) === value) ? getOptionLabel(options.find((o) => getOptionValue(o) === value)!) : value);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (tourNavCtx?.isTourActive) return;
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [tourNavCtx?.isTourActive]);

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                {label}
            </label>
            <div className="relative" ref={ref}>
                <button
                    id={buttonId}
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen((v) => !v);
                    }}
                    className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                >
                    <span className={value !== "All" ? "text-[#6b1176]" : "text-gray-700"}>
                        {selectedLabel}
                    </span>
                    <svg
                        className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
                {isOpen && (
                    <div id={listId} className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                        {options.map((option) => {
                            const optVal = getOptionValue(option);
                            const optLabel = getOptionLabel(option);
                            return (
                                <button
                                    key={optVal}
                                    id={listId ? `${listId}-${optVal}` : undefined}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onChange(optVal);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                        value === optVal
                                            ? "bg-[#6b1176] text-white"
                                            : "text-[#6b1176] hover:bg-gray-100"
                                    }`}
                                >
                                    {optVal === "All" ? allLabel : optLabel}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- FilterToggle ---
type FilterToggleOption = { label: string; value: string; disabled?: boolean };

type FilterToggleProps = {
    label: string;
    value: string;
    onChange: (val: string) => void;
    options: FilterToggleOption[];
};

export const FilterToggle = ({
    label,
    value,
    onChange,
    options,
}: FilterToggleProps) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
            {label}
        </label>
        <div className="flex gap-2">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => !opt.disabled && onChange(opt.value)}
                    className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${
                        value === opt.value
                            ? "bg-[#6b1176] text-white border-[#6b1176]"
                            : "bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50"
                    } ${opt.disabled ? "opacity-50 cursor-not-allowed hover:bg-white" : ""}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    </div>
);

// --- FilterPanel (popup wrapper) ---
type FilterPanelProps = {
    children: ReactNode;
    activeCount?: number;
};

const FilterPanel = ({ children, activeCount = 0 }: FilterPanelProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={panelRef}>
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className={`relative flex items-center justify-center w-9 h-9 border rounded-lg transition-colors ${
                    activeCount > 0 || isOpen
                        ? "bg-[#6b1176] text-white border-[#6b1176]"
                        : "bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50"
                }`}
            >
                <SlidersHorizontal className="w-4 h-4" />
                {activeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-[#6b1176] border-2 border-white text-white text-[10px] font-bold flex items-center justify-center px-0.5">
                        {activeCount}
                    </span>
                )}
            </button>
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-[#E7E1E1] rounded-lg shadow-lg p-4 w-72 flex flex-col gap-3">
                    {children}
                </div>
            )}
        </div>
    );
};

export default FilterPanel;
