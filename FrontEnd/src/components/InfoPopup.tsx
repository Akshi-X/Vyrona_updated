import { useState, type ReactNode } from "react";

type InfoPopupProps = {
    children: ReactNode;
    align?: "left" | "right";
};

const InfoPopup = ({ children, align = "right" }: InfoPopupProps) => {
    const [open, setOpen] = useState(false);

    return (
        <div className={`flex flex-col gap-2 ${align === "right" ? "items-end" : "items-start"}`}>
            {open && children}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`w-7 h-7 rounded-lg border border-white/40 backdrop-blur-sm shadow flex items-center justify-center text-white text-xs font-bold transition-colors ${
                    open ? "bg-white/30" : "bg-white/10 hover:bg-white/20"
                }`}
            >
                i
            </button>
        </div>
    );
};

export default InfoPopup;
