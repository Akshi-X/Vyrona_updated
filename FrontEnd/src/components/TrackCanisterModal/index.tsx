import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Modal from "../Modal";
import ContainerQualityTrackingIcon from "../../assets/DashBoardIcons/DarkContainerQualityTracking.svg";
import { useAuth } from "../../contexts/AuthContext";
import {
    ivfService,
    type IvfBranch,
    type CanisterCheckResponse,
    type TankInTransitCheckResponse,
} from "../../services/ivfService";
import { shipmentService } from "../../services/shipmentService";
import { userService } from "../../services/userService";

interface TrackCanisterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTrack?: (canisterId: string, branchName?: string) => void;
    error?: string;
    title?: string;
    icon?: string;
    inlineMode?: boolean;
}

const TrackCanisterModal: React.FC<TrackCanisterModalProps> = ({
    isOpen,
    onClose,
    onTrack,
    error,
    title = "Track Cryocan Quality",
    icon = ContainerQualityTrackingIcon,
    inlineMode = false,
}) => {
    const { userRole } = useAuth();
    const normalizedRole = (userRole || "").trim().toLowerCase();
    const isManagerAdmin =
        normalizedRole.includes("manager") || normalizedRole.includes("admin");

    const [canisterId, setCanisterId] = useState("");
    const [hisNumber, setHisNumber] = useState("");
    const [cryolockNumber, setCryolockNumber] = useState("");

    const [tanks, setTanks] = useState<{ tank_id: number; tank_code: string }[]>([]);
    const [tanksLoading, setTanksLoading] = useState(false);
    const [isTankDropdownOpen, setIsTankDropdownOpen] = useState(false);
    const tankDropdownRef = useRef<HTMLDivElement | null>(null);
    const tankMenuRef = useRef<HTMLDivElement | null>(null);
    const [tankMenuStyle, setTankMenuStyle] = useState<{
        top: number; left: number; width: number; placement: "bottom" | "top";
    } | null>(null);

    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [branchesError, setBranchesError] = useState<string | null>(null);
    const [selectedBranchName, setSelectedBranchName] = useState("");
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
        null,
    );
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

    const [canisterCheckLoading, setCanisterCheckLoading] = useState(false);
    const [canisterCheckMessage, setCanisterCheckMessage] = useState<
        string | null
    >(null);
    const [canisterCheckError, setCanisterCheckError] = useState<string | null>(
        null,
    );
    const [hasInTransitShipments, setHasInTransitShipments] = useState<
        boolean | null
    >(null);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const branchDropdownRef = useRef<HTMLDivElement | null>(null);
    const branchMenuRef = useRef<HTMLDivElement | null>(null);

    const [branchMenuStyle, setBranchMenuStyle] = useState<{
        top: number;
        left: number;
        width: number;
        placement: "bottom" | "top";
    } | null>(null);

    const updateBranchMenuPosition = useCallback(() => {
        if (typeof window === "undefined") return;
        const el = branchDropdownRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const margin = 8;
        const width = rect.width;
        const left = rect.left;
        const maxHeight = 176;

        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;

        const placement: "bottom" | "top" =
            availableBelow < Math.min(200, maxHeight) &&
            availableAbove > availableBelow
                ? "top"
                : "bottom";

        const top =
            placement === "bottom" ? rect.bottom + margin : rect.top - margin;

        setBranchMenuStyle({ top, left, width, placement });
    }, []);

    useEffect(() => {
        if (!isBranchDropdownOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const clickedTriggerInside = !!branchDropdownRef.current?.contains(
                target,
            );
            const clickedMenuInside = !!branchMenuRef.current?.contains(target);

            if (!clickedTriggerInside && !clickedMenuInside) {
                setIsBranchDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isBranchDropdownOpen]);

    useEffect(() => {
        if (!isBranchDropdownOpen) return;

        updateBranchMenuPosition();

        const handleReposition = () => updateBranchMenuPosition();
        window.addEventListener("resize", handleReposition);
        window.addEventListener("scroll", handleReposition, true);

        return () => {
            window.removeEventListener("resize", handleReposition);
            window.removeEventListener("scroll", handleReposition, true);
        };
    }, [isBranchDropdownOpen, updateBranchMenuPosition]);

    const updateTankMenuPosition = useCallback(() => {
        const el = tankDropdownRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const placement: "bottom" | "top" = availableBelow < 176 && availableAbove > availableBelow ? "top" : "bottom";
        setTankMenuStyle({ top: placement === "bottom" ? rect.bottom + margin : rect.top - margin, left: rect.left, width: rect.width, placement });
    }, []);

    useEffect(() => {
        if (!isTankDropdownOpen) return;
        updateTankMenuPosition();
        const reposition = () => updateTankMenuPosition();
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        const handleClickOutside = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!tankDropdownRef.current?.contains(t) && !tankMenuRef.current?.contains(t)) {
                setIsTankDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isTankDropdownOpen, updateTankMenuPosition]);

    // Fetch tanks when branch is selected
    useEffect(() => {
        if (!selectedBranchName) { setTanks([]); setCanisterId(""); return; }
        setTanksLoading(true);
        setCanisterId("");
        setCanisterCheckMessage(null);
        setCanisterCheckError(null);
        shipmentService
            .getActiveCanisters({ branch_name: selectedBranchName })
            .then((res) => {
                const branch = res.branches?.find((b) => b.branch_name === selectedBranchName);
                setTanks(branch?.tanks ?? []);
            })
            .catch(() => setTanks([]))
            .finally(() => setTanksLoading(false));
    }, [selectedBranchName]);

    useEffect(() => {
        if (!isOpen) return;
        if (!isManagerAdmin) return;

        let cancelled = false;

        setBranchesLoading(true);
        setBranchesError(null);

        userService
            .getProfile()
            .then((profile) => {
                if (cancelled) return;
                return ivfService.getBranches(profile?.hospital_id ?? undefined);
            })
            .then((res) => {
                if (cancelled) return;
                setBranches(Array.isArray(res?.branches) ? res.branches : []);
            })
            .catch((e: any) => {
                if (cancelled) return;
                setBranches([]);
                setBranchesError(
                    (e?.message as string) || "Failed to load branches",
                );
            })
            .finally(() => {
                if (cancelled) return;
                setBranchesLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, isManagerAdmin]);

    const checkCanister = async (
        tankCode: string,
    ): Promise<CanisterCheckResponse | null> => {
        const trimmed = tankCode.trim().toUpperCase();
        if (!trimmed) {
            setCanisterCheckMessage(null);
            setCanisterCheckError(null);
            return null;
        }

        setCanisterCheckLoading(true);
        setCanisterCheckError(null);
        setCanisterCheckMessage(null);

        try {
            const response: CanisterCheckResponse =
                await ivfService.checkCanisterExists(trimmed, selectedBranchId);

            setCanisterCheckMessage(response.message);
            if (!response.exists) {
                setCanisterCheckError(response.message);
            } else {
                setCanisterCheckError(null);
            }

            return response;
        } catch (e: any) {
            const errorMessage =
                (e?.message as string) || "Failed to check tank code";
            setCanisterCheckError(errorMessage);
            setCanisterCheckMessage(null);
            return null;
        } finally {
            setCanisterCheckLoading(false);
        }
    };

    const handleCanisterIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase();
        setCanisterId(value);
        setCanisterCheckMessage(null);
        setCanisterCheckError(null);
        setHasInTransitShipments(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const isOutboundQualityTracking = title === "Outbound Quality Tracking";

        if (isOutboundQualityTracking) {
            const trimmedHisNumber = hisNumber.trim();
            const trimmedCryolockNumber = cryolockNumber.trim();

            if (!trimmedHisNumber) return;

            setCanisterCheckLoading(true);
            setCanisterCheckError(null);
            setCanisterCheckMessage(null);

            try {
                const response: TankInTransitCheckResponse =
                    await ivfService.checkTankInTransitStatus(
                        undefined,
                        undefined,
                        trimmedHisNumber,
                        trimmedCryolockNumber || undefined,
                    );

                const hasShipments =
                    !!(
                        response as {
                            hasInTransitShipments?: boolean;
                            has_in_transit_shipments?: boolean;
                        }
                    )?.hasInTransitShipments ||
                    !!(
                        response as {
                            hasInTransitShipments?: boolean;
                            has_in_transit_shipments?: boolean;
                        }
                    )?.has_in_transit_shipments;

                setHasInTransitShipments(hasShipments);
                setCanisterCheckMessage(
                    response?.message ||
                        (hasShipments
                            ? "In-transit shipments found."
                            : "No in-transit shipments found."),
                );

                if (hasShipments) {
                    onTrack?.(
                        trimmedCryolockNumber || trimmedHisNumber,
                        undefined,
                    );
                }
            } catch (e: any) {
                const errorMessage =
                    (e?.message as string) ||
                    "Failed to check in-transit status";
                setCanisterCheckError(errorMessage);
                setCanisterCheckMessage(null);
            } finally {
                setCanisterCheckLoading(false);
            }
        } else {
            const trimmedCanisterId = canisterId.trim().toUpperCase();
            if (!trimmedCanisterId) return;
            if (isManagerAdmin && !selectedBranchName) return;

            const canisterCheck = await checkCanister(trimmedCanisterId);

            if (canisterCheck?.exists === true) {
                if (isManagerAdmin && selectedBranchId != null) {
                    try {
                        sessionStorage.setItem(
                            "ivf_selected_branch_id",
                            String(selectedBranchId),
                        );
                    } catch {}
                }

                const tankIdForRoute =
                    canisterCheck.canister_id != null
                        ? String(canisterCheck.canister_id)
                        : trimmedCanisterId;

                onTrack?.(
                    tankIdForRoute,
                    isManagerAdmin ? selectedBranchName : undefined,
                );
            }
        }
    };

    const descriptionText =
        title === "Outbound Quality Tracking"
            ? "Please enter the HIS # (Cryolock # is optional)"
            : isManagerAdmin
              ? "Please enter the tank code and branch"
              : "Please enter the tank code";

    const formContent = (
        <form onSubmit={handleSubmit} className="space-y-6">
            {title === "Outbound Quality Tracking" ? (
                <>
                    <div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={hisNumber}
                            onChange={(e) => setHisNumber(e.target.value)}
                            placeholder="HIS #"
                            className="w-full px-4 py-3 rounded-md border border-[#650458] outline-none focus:ring-2 focus:ring-[#bd56af] focus:border-[#bd56af]"
                        />
                    </div>
                    <div>
                        <input
                            type="text"
                            value={cryolockNumber}
                            onChange={(e) => setCryolockNumber(e.target.value)}
                            placeholder="Cryolock # (Optional)"
                            className="w-full px-4 py-3 rounded-md border border-[#650458] outline-none focus:ring-2 focus:ring-[#bd56af] focus:border-[#bd56af]"
                        />
                    </div>
                    {canisterCheckError ? (
                        <p className="text-sm text-red-600">
                            {canisterCheckError}
                        </p>
                    ) : title === "Outbound Quality Tracking" &&
                      hasInTransitShipments === false ? (
                        <p className="text-sm text-orange-600 font-medium">
                            {canisterCheckMessage ||
                                "No in-transit shipments found"}
                        </p>
                    ) : title === "Outbound Quality Tracking" &&
                      hasInTransitShipments === true ? (
                        <p className="text-sm text-green-600 font-medium">
                            In-transit shipments found. Redirecting...
                        </p>
                    ) : canisterCheckMessage && !canisterCheckError ? (
                        <p className="text-sm text-green-600">
                            {canisterCheckMessage}
                        </p>
                    ) : error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : null}
                </>
            ) : (
                <>
                    {/* Branch dropdown — always on top for manager/admin */}
                    {isManagerAdmin && (
                        <div className="relative w-full" ref={branchDropdownRef}>
                            <div
                                className={`relative w-full border rounded-[10px] px-3 py-2.5 cursor-pointer text-sm ${
                                    branchesError ? "border-red-500" : "border-gray-300"
                                } ${!selectedBranchName ? "text-gray-400" : "text-black"} ${
                                    branchesLoading ? "bg-gray-100 cursor-not-allowed" : ""
                                }`}
                                onClick={() => {
                                    if (branchesLoading) return;
                                    if (!isBranchDropdownOpen) updateBranchMenuPosition();
                                    setIsBranchDropdownOpen(!isBranchDropdownOpen);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (branchesLoading) return;
                                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isBranchDropdownOpen) updateBranchMenuPosition(); setIsBranchDropdownOpen(!isBranchDropdownOpen); }
                                    if (e.key === "Escape") setIsBranchDropdownOpen(false);
                                }}
                            >
                                <span className="pr-6 block truncate">{selectedBranchName || (branchesLoading ? "Loading branches..." : "Select Branch")}</span>
                                <svg className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${isBranchDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                            {branchesError && <p className="text-xs text-red-500 mt-1">{branchesError}</p>}
                        </div>
                    )}

                    {/* Tank dropdown — shown after branch selected (manager/admin) or free text (user) */}
                    {isManagerAdmin ? (
                        <div className="relative w-full" ref={tankDropdownRef}>
                            <div
                                className={`relative w-full border rounded-[10px] px-3 py-2.5 text-sm ${
                                    !selectedBranchName ? "bg-gray-50 cursor-not-allowed text-gray-300 border-gray-200" :
                                    tanksLoading ? "bg-gray-100 cursor-not-allowed text-gray-400 border-gray-200" :
                                    canisterCheckError ? "border-red-500 cursor-pointer text-black" :
                                    canisterCheckMessage ? "border-green-500 cursor-pointer text-black" :
                                    "border-gray-300 cursor-pointer " + (!canisterId ? "text-gray-400" : "text-black")
                                }`}
                                onClick={() => {
                                    if (!selectedBranchName || tanksLoading || tanks.length === 0) return;
                                    if (!isTankDropdownOpen) updateTankMenuPosition();
                                    setIsTankDropdownOpen(!isTankDropdownOpen);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (!selectedBranchName || tanksLoading) return;
                                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isTankDropdownOpen) updateTankMenuPosition(); setIsTankDropdownOpen(!isTankDropdownOpen); }
                                    if (e.key === "Escape") setIsTankDropdownOpen(false);
                                }}
                            >
                                <span className="pr-6 block truncate">
                                    {tanksLoading ? "Loading tanks..." :
                                     !selectedBranchName ? "Select branch first" :
                                     canisterId || "Select Tank"}
                                </span>
                                {canisterCheckLoading ? (
                                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                ) : (
                                    <svg className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${isTankDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                )}
                            </div>
                            {canisterCheckError && <p className="mt-1 text-xs text-red-600">{canisterCheckError}</p>}
                            {canisterCheckMessage && !canisterCheckError && <p className="mt-1 text-xs text-green-600">{canisterCheckMessage}</p>}
                            {error && !canisterCheckError && !canisterCheckMessage && <p className="mt-1 text-xs text-red-600">{error}</p>}
                        </div>
                    ) : (
                        <div>
                            <div className="relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={canisterId}
                                    onChange={handleCanisterIdChange}
                                    placeholder="e.g., T50"
                                    className={`w-full px-4 py-3 rounded-md border outline-none focus:ring-2 ${
                                        canisterCheckError ? "border-red-500 focus:ring-red-500" :
                                        canisterCheckMessage && !canisterCheckError ? "border-green-500 focus:ring-green-500" :
                                        "border-[#650458] focus:ring-[#bd56af] focus:border-[#bd56af]"
                                    }`}
                                />
                                {canisterCheckLoading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                            {canisterCheckError && <p className="mt-2 text-sm text-red-600">{canisterCheckError}</p>}
                            {canisterCheckMessage && !canisterCheckError && <p className="mt-2 text-sm text-green-600">{canisterCheckMessage}</p>}
                            {error && !canisterCheckError && !canisterCheckMessage && <p className="mt-2 text-sm text-red-600">{error}</p>}
                        </div>
                    )}

                    {/* Branch dropdown menu */}
                    {isManagerAdmin && isBranchDropdownOpen && branches.length > 0 && branchMenuStyle &&
                        createPortal(
                            <div ref={branchMenuRef} className="fixed z-[1000] bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-44 overflow-y-auto text-sm"
                                style={{ top: branchMenuStyle.top, left: branchMenuStyle.left, width: branchMenuStyle.width, transform: branchMenuStyle.placement === "top" ? "translateY(-100%)" : undefined }}>
                                {branches.map((option) => (
                                    <div key={option.branch_id}
                                        className={`px-3 py-1.5 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${selectedBranchName === option.branch_name ? "bg-[#8b2a96] text-white" : "text-black"}`}
                                        onClick={() => {
                                            setSelectedBranchName(option.branch_name);
                                            setSelectedBranchId(option.branch_id);
                                            try { sessionStorage.setItem("ivf_selected_branch_id", String(option.branch_id)); } catch {}
                                            setIsBranchDropdownOpen(false);
                                        }}>
                                        {option.branch_name}
                                    </div>
                                ))}
                            </div>,
                            document.body
                        )}

                    {/* Tank dropdown menu */}
                    {isManagerAdmin && isTankDropdownOpen && tanks.length > 0 && tankMenuStyle &&
                        createPortal(
                            <div ref={tankMenuRef} className="fixed z-[1000] bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-44 overflow-y-auto text-sm"
                                style={{ top: tankMenuStyle.top, left: tankMenuStyle.left, width: tankMenuStyle.width, transform: tankMenuStyle.placement === "top" ? "translateY(-100%)" : undefined }}>
                                {tanks.map((tank) => (
                                    <div key={tank.tank_id}
                                        className={`px-3 py-1.5 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${canisterId === tank.tank_code ? "bg-[#8b2a96] text-white" : "text-black"}`}
                                        onClick={() => {
                                            setCanisterId(tank.tank_code);
                                            setCanisterCheckMessage(null);
                                            setCanisterCheckError(null);
                                            setHasInTransitShipments(null);
                                            setIsTankDropdownOpen(false);
                                        }}>
                                        {tank.tank_code}
                                    </div>
                                ))}
                            </div>,
                            document.body
                        )}
                </>
            )}

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-5 py-2.5 rounded-md bg-[#650458] text-white hover:opacity-95 disabled:opacity-50"
                    disabled={
                        title === "Outbound Quality Tracking"
                            ? !hisNumber.trim() || canisterCheckLoading
                            : !canisterId.trim() ||
                              (isManagerAdmin && !selectedBranchName) ||
                              canisterCheckLoading
                    }
                >
                    Track
                </button>
            </div>
        </form>
    );

    if (inlineMode) {
        return (
            <div className="w-full max-w-[560px] rounded-[14px] border border-[#E7E1E1] bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-start gap-3">
                    <img
                        src={icon}
                        alt="Track Canister"
                        className="w-6 h-6 mt-0.5"
                    />
                    <div>
                        <h2 className="text-[20px] font-semibold leading-none text-black">
                            {title}
                        </h2>
                        <p className="mt-2 text-xs text-[#5A5A5A]">
                            {descriptionText}
                        </p>
                    </div>
                </div>
                {formContent}
            </div>
        );
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            description={descriptionText}
            icon={<img src={icon} alt="Track Canister" className="w-6 h-6 mt-5" />}
            containerClassName="md:w-[40%]"
        >
            {formContent}
        </Modal>
    );
};

export default TrackCanisterModal;