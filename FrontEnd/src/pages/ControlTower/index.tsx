import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState, useRef } from 'react';
import { shipmentService, type ActiveRouteItem } from '../../services/shipmentService';
import ControlTowerMap from '../../components/ControlTowerMap';
import { Link } from 'react-router-dom';
import { userService } from '../../services/userService';
import ControlTowerIconDark from '../../assets/DashBoardIcons/ControlTowerDark.svg';

const toDeviationCount = (value: unknown): number => {
    const count = Number(value);
    return Number.isFinite(count) ? count : 0;
};

const deriveInboundStatus = (
    statusValue: unknown,
    deviationsValue: unknown,
): "Safe" | "Risk" | "Critical" => {
    if (toDeviationCount(deviationsValue) > 0) return "Critical";

    const status = String(statusValue ?? "")
        .trim()
        .toLowerCase();
    if (status === "critical") return "Critical";
    if (status === "risk") return "Risk";
    return "Safe";
};

const formatSensorLabel = (countValue: unknown): string => {
    const count = toDeviationCount(countValue);
    if (count === 0) return "SAFE";
    return count === 1 ? "1 sensor" : `${count} sensors`;
};

const ControlTower = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

    const [selectedRegion, setSelectedRegion] = useState<string>("All");
    const [selectedStatusInbound, setSelectedStatusInbound] =
        useState<string>("All");
    const [selectedStatusOutbound, setSelectedStatusOutbound] =
        useState<string>("All");
    const [selectedCarrier, setSelectedCarrier] = useState<string>("All");
    const [selectedBranch, setSelectedBranch] = useState<string>("All");
    const [isBranchFilterFromMap, setIsBranchFilterFromMap] =
        useState<boolean>(false);
    const [direction, setDirection] = useState<"inbound" | "outbound">(
        "inbound",
    );
    const [department, setDepartment] = useState<string | null>(null);
    const [_userInitials, setUserInitials] = useState<string>("");
    const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [isCarrierDropdownOpen, setIsCarrierDropdownOpen] = useState(false);
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
    const regionDropdownRef = useRef<HTMLDivElement>(null);
    const statusDropdownRef = useRef<HTMLDivElement>(null);
    const carrierDropdownRef = useRef<HTMLDivElement>(null);
    const branchDropdownRef = useRef<HTMLDivElement>(null);

    // Active routes via API
    const [routes, setRoutes] = useState<ActiveRouteItem[]>([]);
    const [loadingRoutes, setLoadingRoutes] = useState(false);
    const [routesError, setRoutesError] = useState<string | null>(null);

    // Active canisters via API
    const [canisters, setCanisters] = useState<
        Array<{
            id: string;
            canisterId: string;
            tankId: string;
            branchName: string;
            branchId: string;
            status: string;
            deviations?: number;
            date: string;
        }>
    >([]);
    const [loadingCanisters, setLoadingCanisters] = useState(false);
    const [canistersError, setCanistersError] = useState<string | null>(null);
    const [zoomToLocation, setZoomToLocation] = useState<{
        lat: number;
        lng: number;
    } | null>(null);
    const [zoomToBranchName, setZoomToBranchName] = useState<string | null>(
        null,
    );
    const [mapRoutes, setMapRoutes] = useState<
        Array<{
            patient_id: string;
            source_latitude: number;
            source_longitude: number;
            destination_latitude: number;
            destination_longitude: number;
        }>
    >([]);

    // Read department from localStorage (set after OTP verification)
    useEffect(() => {
        try {
            const dept = localStorage.getItem("department");
            setDepartment(dept);
        } catch {
            setDepartment(null);
        }
    }, []);

    const isIvfUser = (department || "").toUpperCase() === "IVF";
    const isCgtUser = (department || "").toUpperCase() === "CGT";

    // Force IVF users to stay on inbound view
    useEffect(() => {
        if (isIvfUser && direction !== "inbound") {
            setDirection("inbound");
        }
    }, [isIvfUser, direction]);

    // Force CGT users to stay on outbound view
    useEffect(() => {
        if (isCgtUser && direction !== "outbound") {
            setDirection("outbound");
        }
    }, [isCgtUser, direction]);

    useEffect(() => {
        // Only fetch active routes for CGT users
        if (!isCgtUser || !isAuthenticated) {
            setRoutes([]);
            setRoutesError(null);
            setLoadingRoutes(false);
            return;
        }

        const fetchRoutes = async () => {
            setLoadingRoutes(true);
            setRoutesError(null);
            try {
                const data = await shipmentService.getActiveRoutes();
                setRoutes(data);
            } catch (e: any) {
                setRoutesError(e?.message || "Failed to load active routes");
                setRoutes([]);
            } finally {
                setLoadingRoutes(false);
            }
        };
        fetchRoutes();
    }, [isAuthenticated, isCgtUser]);

    // Fetch map routes data for coordinates (outbound)
    useEffect(() => {
        const fetchMapRoutes = async () => {
            if (direction === "outbound") {
                try {
                    const data = await shipmentService.getControlTowerMapRoutes(
                        {
                            region:
                                selectedRegion !== "All"
                                    ? selectedRegion
                                    : undefined,
                            routeStatus:
                                selectedStatusOutbound !== "All"
                                    ? selectedStatusOutbound.toLowerCase()
                                    : undefined,
                            carrier:
                                selectedCarrier !== "All"
                                    ? selectedCarrier
                                    : undefined,
                        },
                    );
                    setMapRoutes(
                        data.map((r) => ({
                            patient_id: String(r.patient_id),
                            source_latitude: r.source_latitude,
                            source_longitude: r.source_longitude,
                            destination_latitude: r.destination_latitude,
                            destination_longitude: r.destination_longitude,
                        })),
                    );
                } catch (e: any) {
                    console.warn("Failed to load map routes:", e?.message);
                    setMapRoutes([]);
                }
            }
        };
        if (isAuthenticated && direction === "outbound") {
            fetchMapRoutes();
        }
    }, [
        isAuthenticated,
        direction,
        selectedRegion,
        selectedStatusOutbound,
        selectedCarrier,
    ]);

    useEffect(() => {
        // Only fetch active canisters for IVF users
        if (!isIvfUser || !isAuthenticated) {
            setCanisters([]);
            setCanistersError(null);
            setLoadingCanisters(false);
            return;
        }

        const fetchCanisters = async () => {
            setLoadingCanisters(true);
            setCanistersError(null);
            try {
                // Always fetch all canisters without filters to populate branch/status options
                // Filtering will be done client-side
                const filters: { branch_name?: string; status?: string } = {};
                const data = await shipmentService.getActiveCanisters(filters);
                let flattenedCanisters: Array<{
                    id: string;
                    canisterId: string;
                    tankId: string;
                    branchName: string;
                    branchId: string;
                    status: string;
                    deviations?: number;
                    date: string;
                }> = [];

                // Handle flat format (canisters array) - legacy format
                const dataAny = data as any;
                if (dataAny.canisters && Array.isArray(dataAny.canisters)) {
                    flattenedCanisters = dataAny.canisters.map((canister: any) => {
                        const deviationCount = toDeviationCount(
                            canister.deviations,
                        );
                        const statusText = deriveInboundStatus(
                            canister.status,
                            deviationCount,
                        );

                        // Format date - handle null updated_at
                        let date = "NA";
                        if (canister.updated_at) {
                            const d = new Date(canister.updated_at);
                            if (!isNaN(d.getTime())) {
                                date = d.toLocaleDateString("en-GB");
                            }
                        }

                        return {
                            id: `canister-${canister.canister_number || canister.canister_id}`,
                            canisterId: String(
                                canister.canister_number ||
                                    canister.canister_id,
                            ),
                            tankId: String(
                                canister.tank_id ??
                                    canister.canister_id ??
                                    "N/A",
                            ),
                            branchName: "N/A", // Flat format doesn't have branch info
                            branchId: "N/A", // Flat format doesn't have branch info
                            status: statusText,
                            deviations: deviationCount,
                            date: date,
                        };
                    });
                }
                // Handle nested format (branches with tanks) - new API format
                else if (
                    (data as any).branches &&
                    Array.isArray((data as any).branches)
                ) {
                    flattenedCanisters = (data as any).branches.flatMap(
                        (branch: any) => {
                            // Check if branch has tanks array
                            if (branch.tanks && Array.isArray(branch.tanks)) {
                                return branch.tanks.map((tank: any) => {
                                    // Format date
                                    let date = "NA";
                                    if (tank.updated_at) {
                                        const d = new Date(tank.updated_at);
                                        if (!isNaN(d.getTime())) {
                                            date =
                                                d.toLocaleDateString("en-GB");
                                        }
                                    }
                                    const deviationCount = toDeviationCount(
                                        tank.deviations,
                                    );
                                    const statusText = deriveInboundStatus(
                                        tank.status,
                                        deviationCount,
                                    );

                                    return {
                                        id: `tank-${branch.branch_name || "N/A"}-${tank.tank_code || ""}`,
                                        canisterId: String(
                                            tank.tank_code || "",
                                        ),
                                        tankId: String(tank.tank_id ?? "N/A"),
                                        branchId: String(
                                            branch.branch_id ??
                                                tank.branch_id ??
                                                "N/A",
                                        ),
                                        branchName: branch.branch_name || "N/A",
                                        status: statusText,
                                        deviations: deviationCount,
                                        date: date,
                                    };
                                });
                            }
                            // Legacy format: branches with canisters
                            else if (
                                branch.canisters &&
                                Array.isArray(branch.canisters)
                            ) {
                                return branch.canisters.map((canister: any) => {
                                    const deviationCount = toDeviationCount(
                                        canister.deviations,
                                    );
                                    const statusText = deriveInboundStatus(
                                        canister.canister_status,
                                        deviationCount,
                                    );

                                    // Format date
                                    let date = "NA";
                                    if (canister.updated_at) {
                                        const d = new Date(canister.updated_at);
                                        if (!isNaN(d.getTime())) {
                                            date =
                                                d.toLocaleDateString("en-GB");
                                        }
                                    }

                                    return {
                                        id: `canister-${canister.canister_number || canister.canister_id}`,
                                        canisterId: String(
                                            canister.canister_number ||
                                                canister.canister_id,
                                        ),
                                        tankId: String(
                                            canister.tank_id ??
                                                canister.canister_id ??
                                                "N/A",
                                        ),
                                        branchId: String(
                                            canister.effective_branch_id ??
                                                branch.branch_id ??
                                                "N/A",
                                        ),
                                        branchName: branch.branch_name || "N/A",
                                        status: statusText,
                                        deviations: deviationCount,
                                        date: date,
                                    };
                                });
                            }
                            return [];
                        },
                    );
                }

                setCanisters(flattenedCanisters);
            } catch (e: any) {
                setCanistersError(
                    e?.message || "Failed to load active canisters",
                );
                setCanisters([]);
            } finally {
                setLoadingCanisters(false);
            }
        };
        fetchCanisters();
    }, [isAuthenticated, isIvfUser]);

    // Fetch user profile to compute initials
    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const profile = await userService.getProfile();
                const first = profile.first_name?.trim?.() || "";
                const last = profile.last_name?.trim?.() || "";
                const initials =
                    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "U";
                setUserInitials(initials);
            } catch {
                setUserInitials("U");
            }
        };
        if (isAuthenticated) {
            fetchUserProfile();
        }
    }, [isAuthenticated]);

    // Fetch user profile to compute initials
    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const profile = await userService.getProfile();
                const first = profile.first_name?.trim?.() || "";
                const last = profile.last_name?.trim?.() || "";
                const initials =
                    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "U";
                setUserInitials(initials);
            } catch {
                setUserInitials("U");
            }
        };
        if (isAuthenticated) {
            fetchUserProfile();
        }
    }, [isAuthenticated]);

    // Build filter option lists from routes data
    const regionOptions = useMemo(() => {
        const set = new Set<string>();
        routes.forEach((r) => {
            if (r?.sourceRegion && r.sourceRegion.trim())
                set.add(r.sourceRegion.trim());
            if (r?.destinationRegion && r.destinationRegion.trim())
                set.add(r.destinationRegion.trim());
        });
        return ["All", ...Array.from(set).sort()];
    }, [routes]);

    // Status options for inbound (from canisters)
    const statusOptionsInbound = useMemo(() => {
        const set = new Set<string>();
        canisters.forEach((c) => {
            if (c?.status && String(c.status).trim()) set.add(String(c.status));
        });
        return ["All", ...Array.from(set).sort()];
    }, [canisters]);

    // Status options for outbound (from routes)
    const statusOptionsOutbound = useMemo(() => {
        const set = new Set<string>();
        routes.forEach((r) => {
            if (r?.status && String(r.status).trim()) set.add(String(r.status));
        });
        return ["All", ...Array.from(set).sort()];
    }, [routes]);

    // Current status options based on direction
    const statusOptions = useMemo(() => {
        return direction === "inbound"
            ? statusOptionsInbound
            : statusOptionsOutbound;
    }, [direction, statusOptionsInbound, statusOptionsOutbound]);

    const carrierOptions = useMemo(() => {
        const set = new Set<string>();
        routes.forEach((r) => {
            if (r?.supplyChain && r.supplyChain.trim())
                set.add(r.supplyChain.trim());
        });
        return ["All", ...Array.from(set).sort()];
    }, [routes]);

    // Build branch options from canisters data (for inbound)
    const branchOptions = useMemo(() => {
        const set = new Set<string>();
        canisters.forEach((c) => {
            if (
                c?.branchName &&
                c.branchName.trim() &&
                c.branchName !== "N/A"
            ) {
                set.add(c.branchName.trim());
            }
        });
        return ["All", ...Array.from(set).sort()];
    }, [canisters]);

    // Apply filters to routes (outbound only)
    const filteredRoutes = useMemo(() => {
        return (routes || []).filter((r) => {
            const matchRegion =
                selectedRegion === "All" ||
                r.sourceRegion === selectedRegion ||
                r.destinationRegion === selectedRegion;
            const matchStatus =
                selectedStatusOutbound === "All" ||
                r.status === selectedStatusOutbound;
            const matchCarrier =
                selectedCarrier === "All" || r.supplyChain === selectedCarrier;
            return matchRegion && matchStatus && matchCarrier;
        });
    }, [routes, selectedRegion, selectedStatusOutbound, selectedCarrier]);

    // Canisters are now filtered client-side to preserve all options for dropdowns
    const filteredCanisters = useMemo(() => {
        let result = canisters || [];

        if (selectedBranch && selectedBranch !== "All") {
            result = result.filter((c) => c.branchName === selectedBranch);
        }

        if (selectedStatusInbound && selectedStatusInbound !== "All") {
            result = result.filter((c) => c.status === selectedStatusInbound);
        }

        return result;
    }, [canisters, selectedBranch, selectedStatusInbound]);

    // Reset zoomToLocation after it's been used
    useEffect(() => {
        if (zoomToLocation || zoomToBranchName) {
            const timer = setTimeout(() => {
                setZoomToLocation(null);
                setZoomToBranchName(null);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [zoomToLocation, zoomToBranchName]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                regionDropdownRef.current &&
                !regionDropdownRef.current.contains(event.target as Node)
            ) {
                setIsRegionDropdownOpen(false);
            }
            if (
                statusDropdownRef.current &&
                !statusDropdownRef.current.contains(event.target as Node)
            ) {
                setIsStatusDropdownOpen(false);
            }
            if (
                carrierDropdownRef.current &&
                !carrierDropdownRef.current.contains(event.target as Node)
            ) {
                setIsCarrierDropdownOpen(false);
            }
            if (
                branchDropdownRef.current &&
                !branchDropdownRef.current.contains(event.target as Node)
            ) {
                setIsBranchDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-red-600">
                    Please login to access Control Tower.
                </p>
            </div>
        );
    }



  return (
    <div className="bg-[#FDFAFF] flex w-full" style={{ height: '100vh' }}>
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Control Tower Content */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0 pt-10" >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={ControlTowerIconDark} alt="Control Tower" className="w-8 h-8" />
              <h1 className="font-semibold text-black text-2xl">
                Control Tower
              </h1>
            </div>
            {/**
            <div className="relative group">
              <button
                type="button"
                onClick={async () => {
                  shipmentService.getIVFStorage().catch((error) => {
                    console.error('Failed to fetch latest IVF storage data:', error);
                  });
                }}
                className="px-4 py-2 bg-[#6b1176] text-white text-sm font-medium rounded-lg hover:bg-[#8a2a95] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#6b1176] focus:ring-offset-2"
              >
                Get latest Data
              </button>
              <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                <div className="font-semibold text-black text-xs whitespace-nowrap">
                  Retrieve new patient data from the connected system?
                </div>
              </div>
            </div>
            */}
                    </div>

                    {/* Main Content Grid */}
                    <div className="flex-1 h-full grid grid-cols-1 lg:grid-cols-[380px_1fr] lg:grid-rows-[340px_1fr] gap-6 min-h-0 items-stretch">
                        {/* Left Panel - Filters and Routes */}
                        <div className="order-2 lg:order-1 flex flex-col gap-6 min-w-0 h-full min-h-0 lg:row-span-2">
                            {/* Filters Section */}
                            <div className="bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 w-[380px] flex-shrink-0 flex flex-col justify-center">
                                <div className="flex flex-col gap-3">
                                    {/* Direction Toggle - Only show for IVF department */}
                                    {isIvfUser && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Direction
                                            </label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDirection("inbound")
                                                    }
                                                    className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${
                                                        direction === "inbound"
                                                            ? "bg-[#6b1176] text-white border-[#6b1176]"
                                                            : "bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50"
                                                    }`}
                                                >
                                                    Cryotanks
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!isIvfUser) {
                                                            setDirection(
                                                                "outbound",
                                                            );
                                                        }
                                                    }}
                                                    disabled={isIvfUser}
                                                    className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${
                                                        direction === "outbound"
                                                            ? "bg-[#6b1176] text-white border-[#6b1176]"
                                                            : "bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50"
                                                    } ${isIvfUser ? "opacity-50 cursor-not-allowed hover:bg-white" : ""}`}
                                                >
                                                    Incubators
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Branch Filter (Inbound only) */}
                                    {direction === "inbound" && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Branch
                                            </label>
                                            <div
                                                className="relative"
                                                ref={branchDropdownRef}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsBranchDropdownOpen(
                                                            !isBranchDropdownOpen,
                                                        );
                                                    }}
                                                    className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                                                >
                                                    <span
                                                        className={
                                                            selectedBranch !==
                                                            "All"
                                                                ? "text-[#6b1176]"
                                                                : "text-gray-700"
                                                        }
                                                    >
                                                        {selectedBranch ===
                                                        "All"
                                                            ? "All Branches"
                                                            : selectedBranch}
                                                    </span>
                                                    <svg
                                                        className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? "rotate-180" : ""}`}
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
                                                {isBranchDropdownOpen && (
                                                    <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                        {branchOptions.map(
                                                            (option) => (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        setSelectedBranch(
                                                                            option,
                                                                        );
                                                                        setIsBranchFilterFromMap(
                                                                            false,
                                                                        );
                                                                        if (
                                                                            option ===
                                                                            "All"
                                                                        ) {
                                                                            setZoomToLocation(
                                                                                null,
                                                                            );
                                                                            setZoomToBranchName(
                                                                                null,
                                                                            );
                                                                        }
                                                                        setIsBranchDropdownOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                                        selectedBranch ===
                                                                        option
                                                                            ? "bg-[#6b1176] text-white"
                                                                            : "text-[#6b1176] hover:bg-gray-100"
                                                                    }`}
                                                                >
                                                                    {option ===
                                                                    "All"
                                                                        ? "All Branches"
                                                                        : option}
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Region Filter (Outbound only) */}
                                    {direction === "outbound" && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Region
                                            </label>
                                            <div
                                                className="relative"
                                                ref={regionDropdownRef}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsRegionDropdownOpen(
                                                            !isRegionDropdownOpen,
                                                        );
                                                    }}
                                                    className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                                                >
                                                    <span
                                                        className={
                                                            selectedRegion !==
                                                            "All"
                                                                ? "text-[#6b1176]"
                                                                : "text-gray-700"
                                                        }
                                                    >
                                                        {selectedRegion ===
                                                        "All"
                                                            ? "All Regions"
                                                            : selectedRegion}
                                                    </span>
                                                    <svg
                                                        className={`w-4 h-4 transition-transform ${isRegionDropdownOpen ? "rotate-180" : ""}`}
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
                                                {isRegionDropdownOpen && (
                                                    <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                                        {regionOptions.map(
                                                            (option) => (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        setSelectedRegion(
                                                                            option,
                                                                        );
                                                                        setIsRegionDropdownOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                                        selectedRegion ===
                                                                        option
                                                                            ? "bg-[#6b1176] text-white"
                                                                            : "text-[#6b1176] hover:bg-gray-100"
                                                                    }`}
                                                                >
                                                                    {option ===
                                                                    "All"
                                                                        ? "All Regions"
                                                                        : option}
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Status Filter */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Status
                                        </label>
                                        <div
                                            className="relative"
                                            ref={statusDropdownRef}
                                        >
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsStatusDropdownOpen(
                                                        !isStatusDropdownOpen,
                                                    );
                                                }}
                                                className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                                            >
                                                <span
                                                    className={
                                                        (direction === "inbound"
                                                            ? selectedStatusInbound
                                                            : selectedStatusOutbound) !==
                                                        "All"
                                                            ? "text-[#6b1176]"
                                                            : "text-gray-700"
                                                    }
                                                >
                                                    {(direction === "inbound"
                                                        ? selectedStatusInbound
                                                        : selectedStatusOutbound) ===
                                                    "All"
                                                        ? "All Status"
                                                        : direction ===
                                                            "inbound"
                                                          ? selectedStatusInbound
                                                          : selectedStatusOutbound}
                                                </span>
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${isStatusDropdownOpen ? "rotate-180" : ""}`}
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
                                            {isStatusDropdownOpen && (
                                                <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                                    {statusOptions.map(
                                                        (option) => {
                                                            const currentStatus =
                                                                direction ===
                                                                "inbound"
                                                                    ? selectedStatusInbound
                                                                    : selectedStatusOutbound;
                                                            return (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        if (
                                                                            direction ===
                                                                            "inbound"
                                                                        ) {
                                                                            setSelectedStatusInbound(
                                                                                option,
                                                                            );
                                                                        } else {
                                                                            setSelectedStatusOutbound(
                                                                                option,
                                                                            );
                                                                        }
                                                                        setIsStatusDropdownOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                                        currentStatus ===
                                                                        option
                                                                            ? "bg-[#6b1176] text-white"
                                                                            : "text-[#6b1176] hover:bg-gray-100"
                                                                    }`}
                                                                >
                                                                    {option ===
                                                                    "All"
                                                                        ? "All Status"
                                                                        : option}
                                                                </button>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Carrier Filter (Outbound only) */}
                                    {direction === "outbound" && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Carrier
                                            </label>
                                            <div
                                                className="relative"
                                                ref={carrierDropdownRef}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsCarrierDropdownOpen(
                                                            !isCarrierDropdownOpen,
                                                        );
                                                    }}
                                                    className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                                                >
                                                    <span
                                                        className={
                                                            selectedCarrier !==
                                                            "All"
                                                                ? "text-[#6b1176]"
                                                                : "text-gray-700"
                                                        }
                                                    >
                                                        {selectedCarrier ===
                                                        "All"
                                                            ? "All Carriers"
                                                            : selectedCarrier}
                                                    </span>
                                                    <svg
                                                        className={`w-4 h-4 transition-transform ${isCarrierDropdownOpen ? "rotate-180" : ""}`}
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
                                                {isCarrierDropdownOpen && (
                                                    <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                                        {carrierOptions.map(
                                                            (option) => (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        setSelectedCarrier(
                                                                            option,
                                                                        );
                                                                        setIsCarrierDropdownOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                                        selectedCarrier ===
                                                                        option
                                                                            ? "bg-[#6b1176] text-white"
                                                                            : "text-[#6b1176] hover:bg-gray-100"
                                                                    }`}
                                                                >
                                                                    {option ===
                                                                    "All"
                                                                        ? "All Carriers"
                                                                        : option}
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Active Routes/Canisters List */}
                            <div className="bg-white border border-[#E7E1E1] rounded-lg p-3 w-[380px] flex-1 flex flex-col overflow-hidden min-h-80">
                                <h2 className="font-bold text-black text-base mb-2">
                                    {isIvfUser
                                        ? "Active Containers"
                                        : "Active Routes"}
                                </h2>
                                <div className="grid grid-cols-[minmax(0,130px)_minmax(0,70px)_minmax(0,90px)] pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] gap-3">
                                    <div className="text-left">
                                        {isIvfUser
                                            ? "Containers #"
                                            : "Routes ID"}
                                    </div>
                                    <div className="text-center">Deviation</div>
                                    <div className="text-center">
                                        {isIvfUser
                                            ? "Last Refill Date"
                                            : "Date"}
                                    </div>
                                </div>
                                <div
                                    className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100"
                                    style={{
                                        scrollbarWidth: "thin",
                                    }}
                                >
                                    {(loadingRoutes || loadingCanisters) && (
                                        <div className="flex flex-col divide-y divide-gray-100">
                                            {Array.from(
                                                { length: 10 },
                                                (_, i) => i + 1,
                                            ).map((i) => (
                                                <div
                                                    key={i}
                                                    className="grid grid-cols-[minmax(0,130px)_minmax(0,70px)_minmax(0,90px)] pl-2 pr-2 py-2 items-center gap-3"
                                                >
                                                    <div className="min-w-0 overflow-hidden space-y-2">
                                                        <div className="relative overflow-hidden h-3.5 w-24 rounded-md bg-gray-200">
                                                            <div
                                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                                style={{
                                                                    width: "50%",
                                                                    animationDelay: `${i * 0.08}s`,
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="relative overflow-hidden h-3 w-20 rounded-md bg-gray-100">
                                                            <div
                                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                                style={{
                                                                    width: "50%",
                                                                    animationDelay: `${i * 0.08 + 0.05}s`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-center">
                                                        <div className="relative overflow-hidden h-5 w-12 rounded-full bg-gray-200">
                                                            <div
                                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                                style={{
                                                                    width: "50%",
                                                                    animationDelay: `${i * 0.08}s`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-center">
                                                        <div className="relative overflow-hidden h-3 w-16 rounded-md bg-gray-100">
                                                            <div
                                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                                style={{
                                                                    width: "50%",
                                                                    animationDelay: `${i * 0.08}s`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {!loadingRoutes &&
                                        !loadingCanisters &&
                                        ((isCgtUser && routesError) ||
                                            (isIvfUser && canistersError)) && (
                                            <div className="p-4 text-xs text-red-600">
                                                {isIvfUser
                                                    ? canistersError
                                                    : routesError}
                                            </div>
                                        )}
                                    {!loadingRoutes &&
                                        !loadingCanisters &&
                                        ((isCgtUser && !routesError) ||
                                            (isIvfUser && !canistersError)) && (
                                            <>
                                                {/* Display Routes (CGT users only) */}
                                                {isCgtUser &&
                                                    filteredRoutes &&
                                                    filteredRoutes.length > 0 &&
                                                    filteredRoutes.map(
                                                        (route) => {
                                                            const statusText =
                                                                route?.status ||
                                                                "N/A";
                                                            const statusColor =
                                                                statusText ===
                                                                "Safe"
                                                                    ? "text-[#00B050]"
                                                                    : statusText ===
                                                                        "Risk"
                                                                      ? "text-[#FF0000]"
                                                                      : statusText ===
                                                                          "Delayed"
                                                                        ? "text-[#FFA500]"
                                                                        : statusText ===
                                                                            "Critical"
                                                                          ? "text-[#FF0000]"
                                                                          : "text-gray-500";
                                                            const handleRouteClick =
                                                                (
                                                                    e: React.MouseEvent,
                                                                ) => {
                                                                    // Don't zoom if clicking on the link
                                                                    if (
                                                                        (
                                                                            e.target as HTMLElement
                                                                        )
                                                                            .tagName ===
                                                                        "A"
                                                                    ) {
                                                                        return;
                                                                    }
                                                                    const mapRoute =
                                                                        mapRoutes.find(
                                                                            (
                                                                                r,
                                                                            ) =>
                                                                                r.patient_id ===
                                                                                route.patientId,
                                                                        );
                                                                    if (
                                                                        mapRoute
                                                                    ) {
                                                                        setZoomToLocation(
                                                                            {
                                                                                lat: mapRoute.source_latitude,
                                                                                lng: mapRoute.source_longitude,
                                                                            },
                                                                        );
                                                                    }
                                                                };

                                                            return (
                                                                <div
                                                                    key={
                                                                        route?.id ??
                                                                        Math.random()
                                                                    }
                                                                    className="grid grid-cols-[minmax(0,130px)_minmax(0,70px)_minmax(0,90px)] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-3 cursor-pointer"
                                                                    onClick={
                                                                        handleRouteClick
                                                                    }
                                                                >
                                                                    <div className="min-w-0 text-left overflow-hidden">
                                                                        {route?.patientId ? (
                                                                            <Link
                                                                                to={`/track/${route.patientId}`}
                                                                                className="text-[#6b1176] text-xs font-bold hover:underline cursor-pointer truncate block"
                                                                                onClick={(
                                                                                    e,
                                                                                ) =>
                                                                                    e.stopPropagation()
                                                                                }
                                                                            >
                                                                                {
                                                                                    route.patientId
                                                                                }
                                                                            </Link>
                                                                        ) : (
                                                                            <span className="text-[#6b1176] text-xs font-bold">
                                                                                N/A
                                                                            </span>
                                                                        )}
                                                                        <div
                                                                            className="text-xs text-gray-900 leading-snug"
                                                                            title={
                                                                                route?.origin &&
                                                                                route?.destination
                                                                                    ? `${route.origin} → ${route.destination}`
                                                                                    : route?.routeText ||
                                                                                      ""
                                                                            }
                                                                        >
                                                                            {route?.origin &&
                                                                            route?.destination ? (
                                                                                <>
                                                                                    <div className="truncate">
                                                                                        {route?.origin ||
                                                                                            "-"}
                                                                                    </div>
                                                                                    <div className="truncate">
                                                                                        →{" "}
                                                                                        {route?.destination ||
                                                                                            "-"}
                                                                                    </div>
                                                                                </>
                                                                            ) : (
                                                                                <div className="truncate">
                                                                                    {route?.routeText ||
                                                                                        "-"}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {route?.supplyChain && (
                                                                            <div className="text-[10px] text-gray-400 truncate">
                                                                                {
                                                                                    route?.supplyChain
                                                                                }
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div
                                                                        className={`text-center text-xs font-medium ${statusColor}`}
                                                                    >
                                                                        {
                                                                            statusText
                                                                        }
                                                                    </div>
                                                                    <div className="text-left text-xs font-bold text-gray-600 truncate">
                                                                        {route?.date ||
                                                                            "-"}
                                                                    </div>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                {/* Display Canisters (IVF users only) */}
                                                {isIvfUser &&
                                                    filteredCanisters &&
                                                    filteredCanisters.length >
                                                        0 &&
                                                    filteredCanisters.map(
                                                        (canister) => {
                                                            const deviationCount =
                                                                toDeviationCount(
                                                                    canister.deviations,
                                                                );
                                                            const sensorLabel =
                                                                formatSensorLabel(
                                                                    deviationCount,
                                                                );
                                                            const pillClass =
                                                                deviationCount >
                                                                0
                                                                    ? "border-[#FECACA] bg-[#FEF3F2] text-[#B42318]"
                                                                    : "border-[#A6F4C5] bg-[#ECFDF3] text-[#027A48]";
                                                            return (
                                                                <div
                                                                    key={
                                                                        canister.id
                                                                    }
                                                                    className="grid grid-cols-[minmax(0,130px)_minmax(0,70px)_minmax(0,90px)] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-3 cursor-pointer"
                                                                    onClick={() => {
                                                                        try {
                                                                            if (
                                                                                canister.branchId &&
                                                                                canister.branchId !==
                                                                                    "N/A"
                                                                            ) {
                                                                                sessionStorage.setItem(
                                                                                    "ivf_selected_branch_id",
                                                                                    String(
                                                                                        canister.branchId,
                                                                                    ),
                                                                                );
                                                                            }
                                                                            navigate(
                                                                                `/ivf-track-shipment/${encodeURIComponent(
                                                                                    canister.tankId &&
                                                                                        canister.tankId !==
                                                                                            "N/A"
                                                                                        ? canister.tankId
                                                                                        : canister.canisterId,
                                                                                )}`,
                                                                            );
                                                                        } catch {}
                                                                    }}
                                                                >
                                                                    <div className="min-w-0 text-left overflow-hidden">
                                                                        {canister.canisterId ? (
                                                                            <span className="text-[#6b1176] text-xs font-bold hover:underline truncate block">
                                                                                Container{" "}
                                                                                {
                                                                                    canister.canisterId
                                                                                }
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[#6b1176] text-xs font-bold">
                                                                                Container{" "}
                                                                                {
                                                                                    canister.canisterId
                                                                                }
                                                                            </span>
                                                                        )}
                                                                        {canister.branchName &&
                                                                            canister.branchName !==
                                                                                "N/A" && (
                                                                                <div className="text-xs text-gray-900 leading-snug">
                                                                                    <div className="truncate">
                                                                                        {
                                                                                            canister.branchName
                                                                                        }
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                    </div>
                                                                    <div className="text-center">
                                                                        <span
                                                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pillClass}`}
                                                                        >
                                                                            {
                                                                                sensorLabel
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-center text-xs font-bold text-gray-600 truncate">
                                                                        {canister.date ||
                                                                            "NA"}
                                                                    </div>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                {isIvfUser &&
                                                    (!filteredCanisters ||
                                                        filteredCanisters.length ===
                                                            0) &&
                                                    !loadingCanisters && (
                                                        <div className="p-4 text-xs text-gray-500">
                                                            No active containers
                                                            found.
                                                        </div>
                                                    )}
                                                {isCgtUser &&
                                                    (!filteredRoutes ||
                                                        filteredRoutes.length ===
                                                            0) &&
                                                    !loadingRoutes && (
                                                        <div className="p-4 text-xs text-gray-500">
                                                            No active routes
                                                            found.
                                                        </div>
                                                    )}
                                            </>
                                        )}
                                </div>
                            </div>
                        </div>

                        {/* Right Panel - Map Visualization */}
                        <div className="order-1 lg:order-2 flex flex-col gap-6 min-w-0 w-full row-span-2 h-full min-h-0">
                            <ControlTowerMap
                                filters={{
                                    selectedRegion,
                                    selectedStatus:
                                        direction === "inbound"
                                            ? selectedStatusInbound
                                            : selectedStatusOutbound,
                                    selectedCarrier,
                                    selectedBranch,
                                }}
                                direction={direction}
                                zoomToLocation={zoomToLocation}
                                zoomToBranchName={zoomToBranchName}
                                isBranchFilterFromMap={isBranchFilterFromMap}
                                onClearBranchFilter={() => {
                                    setSelectedBranch("All");
                                    setIsBranchFilterFromMap(false);
                                    setZoomToLocation(null);
                                    setZoomToBranchName(null);
                                }}
                                onBranchSelect={(branchName) => {
                                    setSelectedBranch(branchName);
                                    setIsBranchFilterFromMap(true);
                                    setZoomToBranchName(branchName);
                                }}
                            />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ControlTower;
