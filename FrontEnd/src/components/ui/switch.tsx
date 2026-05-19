import * as React from "react";

interface SwitchProps {
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    "aria-label"?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
    ({ checked, onCheckedChange, disabled, id, "aria-label": ariaLabel }, ref) => {
        return (
            <button
                ref={ref}
                type="button"
                role="switch"
                id={id}
                aria-checked={checked}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => onCheckedChange?.(!checked)}
                className={[
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
                    "transition-colors duration-200 ease-in-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    checked ? "bg-primary" : "bg-gray-200",
                ].join(" ")}
            >
                <span
                    aria-hidden="true"
                    className={[
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out",
                        checked ? "translate-x-5" : "translate-x-0",
                    ].join(" ")}
                />
            </button>
        );
    },
);

Switch.displayName = "Switch";

export { Switch };
