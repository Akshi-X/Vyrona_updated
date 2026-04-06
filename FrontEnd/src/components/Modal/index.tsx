import React from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    containerClassName?: string;
    headerAction?: React.ReactNode;
    scrollableContainerClassName?: string;
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    description,
    icon,
    children,
    containerClassName,
    headerAction,
    scrollableContainerClassName: _scrollableContainerClassName,
}) => {
    useBodyScrollLock(isOpen);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/70 overflow-hidden h-full w-full z-[100]"
            onClick={onClose}
        >
            {/* Mobile: full sheet (inset-x-3 top-14 bottom-3, matching alert config) */}
            <div
                className={`
                    fixed inset-x-3 top-14 bottom-3 z-[101] flex flex-col rounded-xl bg-white shadow-lg border overflow-hidden
                    md:static md:inset-auto md:rounded-md md:shadow-none md:border-0 md:bg-transparent md:overflow-visible md:flex-none
                    md:hidden
                `}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon on top — mobile */}
                {icon && (
                    <div className="px-5 pt-5 pb-2 shrink-0">
                        {icon}
                    </div>
                )}
                {/* Header */}
                <div className="flex items-start justify-between px-5 pb-3 shrink-0">
                    <div>
                        <h3 className="text-[16px] font-semibold text-black">{title}</h3>
                        <p className="text-[12px] text-[#969696]">{description}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                        {headerAction}
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0">
                            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
                    {children}
                </div>
            </div>

            {/* Desktop: centered dialog */}
            <div className="hidden md:flex items-center justify-center min-h-screen p-4">
                <div
                    className={`relative mx-auto border ${containerClassName ?? "w-4/5"} shadow-lg rounded-md bg-white max-h-[90vh] overflow-hidden`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6 mt-2">
                            <div className="flex items-center">
                                {icon && (
                                    <div className="w-8 h-8 flex items-center justify-center mr-3">
                                        {icon}
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-[16px] font-semibold text-black">{title}</h3>
                                    <p className="text-[12px] text-[#969696]">{description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {headerAction}
                                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                    <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Modal;
