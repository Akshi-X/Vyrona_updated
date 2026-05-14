import { useEffect, useMemo, useRef, useState } from "react";

type MultiSelectOption = string | { label: string; value: string };

interface MultiSelectDropdownProps {
    label: string;
    options: MultiSelectOption[];
    selected: string[];
    placeholder?: string;
    disabled?: boolean;
    onChange: (nextSelected: string[]) => void;
}

export default function MultiSelectDropdown({
    label,
    options,
    selected,
    placeholder = "Select",
    disabled = false,
    onChange,
}: MultiSelectDropdownProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const normalizedSelected = useMemo(() => new Set(selected), [selected]);

    const normalizedOptions = useMemo(
        () =>
            options.map((option) =>
                typeof option === "string"
                    ? { label: option, value: option }
                    : option,
            ),
        [options],
    );

    const filteredOptions = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return normalizedOptions;
        return normalizedOptions.filter((option) =>
            option.label.toLowerCase().includes(term),
        );
    }, [normalizedOptions, search]);

    const selectedLabel = useMemo(() => {
        if (selected.length === 0) return placeholder;
        if (selected.length === 1) {
            const selectedOption = normalizedOptions.find(
                (option) => option.value === selected[0],
            );
            return selectedOption?.label || selected[0];
        }
        return `${selected.length} selected`;
    }, [placeholder, selected, normalizedOptions]);

    const toggleOption = (value: string) => {
        if (normalizedSelected.has(value)) {
            onChange(selected.filter((item) => item !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const toggleAll = () => {
        if (selected.length === normalizedOptions.length) {
            onChange([]);
        } else {
            onChange(normalizedOptions.map((option) => option.value));
        }
    };

    const clearSelection = () => {
        onChange([]);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className="flex flex-col relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                {label}
            </label>
            <button
                type="button"
                onClick={() => !disabled && setOpen((prev) => !prev)}
                className={`w-full px-3 h-12 border rounded-lg text-sm text-left flex items-center justify-between transition-colors ${
                    disabled
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
                        : "bg-white border-line hover:border-[#c49ad1]"
                }`}
            >
                <span
                    className={
                        selected.length > 0
                            ? "text-primary"
                            : "text-gray-500"
                    }
                >
                    {selectedLabel}
                </span>
                <svg
                    className={`w-4 h-4 transition-transform ${
                        open ? "rotate-180" : ""
                    } ${disabled ? "text-gray-300" : "text-gray-500"}`}
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

            {open && !disabled && (
                <div className="absolute z-20 top-full mt-1 w-full bg-white border border-line rounded-lg shadow-lg overflow-hidden">
                    <div className="p-3 border-b border-primary-bg">
                        <input
                            type="text"
                            placeholder="Search tanks"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="w-full px-3 py-2 text-sm border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-primary-muted"
                        />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500 border-b border-primary-bg">
                        <span>{filteredOptions.length} options</span>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="text-primary font-semibold hover:underline"
                            >
                                {selected.length === normalizedOptions.length
                                    ? "Clear all"
                                    : "Select all"}
                            </button>
                            {selected.length > 0 && (
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    className="text-gray-500 hover:underline"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                        {filteredOptions.length === 0 && (
                            <div className="px-3 py-3 text-sm text-gray-400">
                                No matching tanks
                            </div>
                        )}
                        {filteredOptions.map((option) => {
                            const isSelected = normalizedSelected.has(option.value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleOption(option.value)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                                        isSelected
                                            ? "bg-[#f7ecfb] text-primary"
                                            : "text-gray-700 hover:bg-gray-100"
                                    }`}
                                >
                                    <span
                                        className={`w-4 h-4 border rounded-sm flex items-center justify-center ${
                                            isSelected
                                                ? "border-primary bg-primary"
                                                : "border-gray-300 bg-white"
                                        }`}
                                    >
                                        {isSelected && (
                                            <svg
                                                className="w-3 h-3 text-white"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={3}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="truncate">{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
