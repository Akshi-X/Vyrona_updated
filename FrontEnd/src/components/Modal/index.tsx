import React from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useTourNavContext } from "../../contexts/TourNavContext";

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
    id?: string;
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
    id,
}) => {
    useBodyScrollLock(isOpen);
    const tourNavCtx = useTourNavContext();
    const isTourActive = tourNavCtx?.isTourActive ?? false;

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/70 z-[100] md:flex md:items-center md:justify-center md:p-4"
            onClick={isTourActive ? undefined : onClose}
        >
            <div
                id={id}
                className={`
                    fixed inset-0 flex flex-col rounded-xl
                    md:static md:inset-auto md:rounded-md md:max-h-[90vh] md:mx-auto md:w-4/5
                    bg-white shadow-lg border z-[101]
                    ${containerClassName ?? ""}
                `}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-4 md:px-6 md:py-6 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        {icon && (
                            <div className="hidden md:flex w-8 h-8 items-center justify-center mr-1 shrink-0">
                                {icon}
                            </div>
                        )}
                        <div className="min-w-0">
                            <h3 className="text-[15px] md:text-[16px] font-semibold text-black truncate">{title}</h3>
                            <p className="hidden md:block text-[12px] text-[#969696]">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 ml-3 shrink-0">
                        {headerAction}
                        <button id="onboarding-modal-close-btn" onClick={onClose} className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full transition-colors">
                            <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-4 md:px-6 md:pb-6 min-h-0">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default Modal;
