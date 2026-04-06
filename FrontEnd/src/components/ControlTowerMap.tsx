import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    useRef,
} from "react";
import {
    GoogleMap,
    Polyline,
    OverlayView,
    useGoogleMap,
} from "@react-google-maps/api";

// Minimal AdvancedMarkerElement wrapper — used inside <GoogleMap> like the old <Marker>
interface AdvancedMarkerProps {
    position: google.maps.LatLngLiteral;
    iconUrl?: string;
    dotColor?: string;
    title?: string;
    onClick?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const AdvancedMarker: React.FC<AdvancedMarkerProps> = ({
    position, iconUrl, dotColor, title, onClick, onMouseEnter, onMouseLeave,
}) => {
    const map = useGoogleMap();

    React.useEffect(() => {
        if (!map) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AdvancedMarkerElement = (google.maps as any).marker?.AdvancedMarkerElement;
        if (!AdvancedMarkerElement) return;

        let content: HTMLElement;
        if (iconUrl) {
            const img = document.createElement("img");
            img.src = iconUrl;
            img.style.cssText = "width:28px;height:28px;display:block;";
            content = img;
        } else if (dotColor) {
            const dot = document.createElement("div");
            dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${dotColor};border:2px solid #fff;box-sizing:border-box;`;
            content = dot;
        } else {
            return;
        }

        const marker = new AdvancedMarkerElement({ map, position, content, title });
        if (onClick) marker.addListener("gmp-click", onClick);
        if (onMouseEnter) marker.element?.addEventListener("mouseenter", onMouseEnter);
        if (onMouseLeave) marker.element?.addEventListener("mouseleave", onMouseLeave);

        return () => { marker.map = null; };
    // position/iconUrl/dotColor changes are handled by React key on the parent — keep deps minimal
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    return null;
};
import { shipmentService } from "../services/shipmentService";
import MarkerGreen from "../assets/ControlTower/MarkerGreen.svg";
import MarkerRed from "../assets/ControlTower/MarkerRed.svg";
import MarkerYellow from "../assets/ControlTower/MarkerYellow.svg";
import { useGoogleMaps } from "../contexts/GoogleMapsProvider";
import InfoPopup from "./InfoPopup";

type MapRoute = {
    shipment_id: number | string;

    patient_id: string;

    source_location: string;

    destination_location: string;

    source_latitude: number;

    source_longitude: number;

    destination_latitude: number;

    destination_longitude: number;

    route_status?: string;
};

type IVFBranch = {
    branch_name: string;
    branch_status: string;
    country_name?: string;
    address: {
        area: string;
        district: string;
        pincode: string;
    };
    geoLocation: {
        latitude: number;
        longitude: number;
    };
    state: string;
};

interface ControlTowerMapFilters {
    selectedRegion?: string;
    selectedStatus?: string;
    selectedCarrier?: string;
    selectedBranch?: string;
}

interface ControlTowerMapProps {
    filters?: ControlTowerMapFilters;
    direction?: "inbound" | "outbound";
    zoomToLocation?: google.maps.LatLngLiteral | null;
    // Optional: zoom to IVF branch by name (used for canister list clicks)
    zoomToBranchName?: string | null;
    // Optional: notify parent when an IVF branch marker is clicked
    onBranchSelect?: (branchName: string) => void;
    // Optional: indicates branch filter came from map click
    isBranchFilterFromMap?: boolean;
    // Optional: clear branch filter action
    onClearBranchFilter?: () => void;
}

const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
};

const toValidLatLng = (
    latitude: unknown,
    longitude: unknown,
): google.maps.LatLngLiteral | null => {
    const lat = toFiniteNumber(latitude);
    const lng = toFiniteNumber(longitude);
    if (lat === null || lng === null) return null;
    if (lat < -90 || lat > 90) return null;
    if (lng < -180 || lng > 180) return null;
    return { lat, lng };
};

const normalizeBranchName = (value: unknown): string =>
    String(value ?? "")
        .trim()
        .toLowerCase();

const normalizeTankStatus = (value: unknown): string =>
    String(value ?? "")
        .trim()
        .toLowerCase();

const toDeviationCount = (value: unknown): number => {
    const count = Number(value);
    return Number.isFinite(count) ? count : 0;
};

const aggregateBranchStatusFromTanks = (tanks: any[]): string => {
    const hasDeviation = (tanks || []).some(
        (tank) => toDeviationCount(tank?.deviations) > 0,
    );
    if (hasDeviation) return "critical";

    const normalizedStatuses = new Set(
        (tanks || []).map((tank) =>
            normalizeTankStatus(tank?.status ?? tank?.canister_status),
        ),
    );

    if (normalizedStatuses.has("critical")) return "critical";
    if (normalizedStatuses.has("risk")) return "risk";
    return "safe";
};

const getBranchStatusMapFromActiveCanisters = (
    payload: any,
): Map<string, string> => {
    const statusMap = new Map<string, string>();
    const branches = Array.isArray(payload?.branches) ? payload.branches : [];

    branches.forEach((branch: any) => {
        const branchKey = normalizeBranchName(branch?.branch_name);
        if (!branchKey) return;

        const tanks = Array.isArray(branch?.tanks)
            ? branch.tanks
            : Array.isArray(branch?.canisters)
              ? branch.canisters
              : [];

        statusMap.set(branchKey, aggregateBranchStatusFromTanks(tanks));
    });

    return statusMap;
};


const ControlTowerMap: React.FC<ControlTowerMapProps> = ({
    filters,
    direction = "outbound",
    zoomToLocation,
    zoomToBranchName,
    onBranchSelect,
    isBranchFilterFromMap = false,
    onClearBranchFilter,
}) => {
    const [routes, setRoutes] = useState<MapRoute[]>([]);

    const [error, setError] = useState<string | null>(null);

    const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);

    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState<
        Map<string, google.maps.LatLngLiteral>
    >(new Map());
    const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
    const shouldLoadRoutes = true;
    const [isMapDataLoading, setIsMapDataLoading] = useState(false);
    const [ivfBranches, setIvfBranches] = useState<IVFBranch[]>([]);
    const [highestBranchCountCountry, setHighestBranchCountCountry] = useState<
        string | null
    >(null);
    const [pendingBranchZoomName, setPendingBranchZoomName] = useState<
        string | null
    >(null);

    const displayedIvfBranches = useMemo(() => {
        let branches = ivfBranches;

        if (filters?.selectedBranch && filters.selectedBranch !== "All") {
            branches = branches.filter(
                (b) => b.branch_name === filters.selectedBranch,
            );
        }

        return branches;
    }, [ivfBranches, filters?.selectedBranch]);

    const { isLoaded } = useGoogleMaps();

    useEffect(() => {
        // Only load routes and IVF markers if the flag is enabled
        if (!shouldLoadRoutes) {
            return;
        }

        let mounted = true;
        setIsMapDataLoading(true);

        // Clear existing polylines when filters or direction change
        polylinesRef.current.forEach((polyline) => {
            try {
                google.maps.event.clearInstanceListeners(polyline);
                polyline.setMap(null);
            } catch (error) {
                return;
            }
        });
        polylinesRef.current.clear();

        // Immediately clear routes and IVF branches state to prevent old data from being rendered
        setRoutes([]);
        setIvfBranches([]);
        // Clear tooltip state to prevent stale tooltips
        setActiveTooltip(null);
        setTooltipPosition(new Map());
        // Clear any previous errors
        setError(null);

        // Load data based on direction
        if (direction === "inbound") {
            // Only skip IVF data when department is explicitly non-IVF
            let department: string | null = null;
            try {
                department = localStorage.getItem("department");
            } catch {
                department = null;
            }
            if (department && department.toUpperCase() !== "IVF") {
                setIvfBranches([]);
                setHighestBranchCountCountry(null);
                setIsMapDataLoading(false);
                return;
            }

            // Fetch IVF Control Tower data for inbound
            (async () => {
                try {
                    const [controlTowerResult, activeCanistersResult] =
                        await Promise.allSettled([
                            shipmentService.getIVFControlTower(),
                            shipmentService.getActiveCanisters(),
                        ]);

                    if (controlTowerResult.status !== "fulfilled") {
                        throw controlTowerResult.reason;
                    }

                    const data = controlTowerResult.value;
                    const branchStatusByName =
                        activeCanistersResult.status === "fulfilled"
                            ? getBranchStatusMapFromActiveCanisters(
                                  activeCanistersResult.value,
                              )
                            : new Map<string, string>();

                    if (activeCanistersResult.status === "rejected") {
                        console.warn(
                            "Failed to load IVF active canisters for branch status override:",
                            (activeCanistersResult as PromiseRejectedResult)
                                .reason?.message,
                        );
                    }

                    if (mounted && data.states) {
                        // Extract highest branch count country
                        const highestCountry =
                            data.highest_branch_count_country || null;
                        setHighestBranchCountCountry(highestCountry);

                        // Transform the nested state structure into a flat array of branches
                        let branches: IVFBranch[] = [];
                        Object.entries(data.states).forEach(
                            ([stateName, stateBranches]) => {
                                (stateBranches as any[]).forEach(
                                    (branch: any) => {
                                        const validLocation = toValidLatLng(
                                            branch?.geoLocation?.latitude,
                                            branch?.geoLocation?.longitude,
                                        );
                                        if (!validLocation) return;
                                        const branchStatusOverride =
                                            branchStatusByName.get(
                                                normalizeBranchName(
                                                    branch?.branch_name,
                                                ),
                                            );
                                        branches.push({
                                            ...branch,
                                            branch_status:
                                                branchStatusOverride ||
                                                branch?.branch_status ||
                                                "safe",
                                            geoLocation: {
                                                latitude: validLocation.lat,
                                                longitude: validLocation.lng,
                                            },
                                            state: stateName,
                                        });
                                    },
                                );
                            },
                        );

                        // Filter by status if filter is set
                        if (
                            filters?.selectedStatus &&
                            filters.selectedStatus !== "All"
                        ) {
                            const normalizedFilterStatus =
                                filters.selectedStatus.toLowerCase();
                            branches = branches.filter((b) => {
                                const branchStatus =
                                    b.branch_status?.toLowerCase() || "";
                                // Map filter status to branch status
                                // Filter "Safe" -> show branches with status "safe"
                                // Filter "Risk" -> show branches with status "risk" or "critical"
                                // Filter "Critical" -> show branches with status "critical"
                                if (normalizedFilterStatus === "safe") {
                                    return branchStatus === "safe";
                                } else if (normalizedFilterStatus === "risk") {
                                    return (
                                        branchStatus === "risk" ||
                                        branchStatus === "critical"
                                    );
                                } else if (
                                    normalizedFilterStatus === "critical"
                                ) {
                                    return branchStatus === "critical";
                                }
                                return false;
                            });
                        }

                        setIvfBranches(branches);
                    }
                } catch (e: any) {
                    // Silently fail for IVF data - it's optional
                    if (mounted) {
                        console.warn(
                            "Failed to load IVF control tower data:",
                            e?.message,
                        );
                    }
                } finally {
                    if (mounted) setIsMapDataLoading(false);
                }
            })();
        } else {
            // Fetch routes for outbound
            (async () => {
                try {
                    // Map UI status labels to API route_status values: safe, delayed, high_risk
                    const normalizeStatusForApi = (
                        status: string | undefined,
                    ) => {
                        if (!status || status === "All") return undefined;
                        const s = status.toLowerCase();
                        if (s.includes("safe")) return "safe";
                        if (s.includes("delay")) return "delayed";
                        if (s.includes("risk")) return "high_risk";
                        return undefined;
                    };

                    // Build filter object for API call
                    const apiFilters = {
                        region:
                            filters?.selectedRegion &&
                            filters.selectedRegion !== "All"
                                ? filters.selectedRegion
                                : undefined,
                        routeStatus: normalizeStatusForApi(
                            filters?.selectedStatus,
                        ),
                        carrier:
                            filters?.selectedCarrier &&
                            filters.selectedCarrier !== "All"
                                ? filters.selectedCarrier
                                : undefined,
                    };

                    const data =
                        await shipmentService.getControlTowerMapRoutes(
                            apiFilters,
                        );

                    if (mounted) {
                        // Handle both direct array and object with routes property
                        const routesData = Array.isArray(data)
                            ? data
                            : (data as any)?.routes || [];
                        setRoutes(routesData);
                    }
                } catch (e: any) {
                    if (mounted)
                        setError(e?.message || "Failed to load map routes");
                } finally {
                    if (mounted) setIsMapDataLoading(false);
                }
            })();
        }

        return () => {
            mounted = false;
        };
    }, [
        shouldLoadRoutes,
        direction,
        filters?.selectedRegion,
        filters?.selectedStatus,
        filters?.selectedCarrier,
    ]);

    const mapCenter = useMemo<google.maps.LatLngLiteral>(
        () => ({ lat: 15, lng: 20 }),
        [],
    );

    const mapOptions = useMemo<google.maps.MapOptions>(
        () => ({
            disableDefaultUI: true,

            zoomControl: false,

            mapTypeControl: false,

            streetViewControl: false,

            fullscreenControl: false,

            mapId: import.meta.env.VITE_GOOGLE_MAP_ID,
            colorScheme: "DARK" as google.maps.ColorScheme,

            gestureHandling: "greedy",

            minZoom: 2,

            maxZoom: 9,

            backgroundColor: "#272626",
        }),
        [],
    );

    // Force remount of GoogleMap when filters, direction, or route set changes to ensure
    // any stale polylines/markers are fully removed from the map instance.
    const mapInstanceKey = useMemo(
        () =>
            [
                direction || "outbound",
                filters?.selectedRegion || "all-region",
                filters?.selectedStatus || "all-status",
                filters?.selectedCarrier || "all-carrier",
            ].join("|"),
        [
            direction,
            filters?.selectedRegion,
            filters?.selectedStatus,
            filters?.selectedCarrier,
        ],
    );

    const handleLoad = useCallback((map: google.maps.Map) => {
        const g = (window as any).google;

        if (g?.maps?.ControlPosition) {
            map.setOptions({
                zoomControlOptions: {
                    position: g.maps.ControlPosition.LEFT_CENTER,
                },
            });
        }

        setMapRef(map);
    }, []);

    // Auto-zoom to highest branch count country when inbound
    useEffect(() => {
        if (
            direction === "inbound" &&
            mapRef &&
            highestBranchCountCountry &&
            ivfBranches.length > 0
        ) {
            // Filter branches by the highest branch count country
            const countryBranches = ivfBranches.filter(
                (b) => b.country_name === highestBranchCountCountry,
            );

            if (countryBranches.length > 0) {
                // Calculate bounds for all branches in that country
                const bounds = new google.maps.LatLngBounds();
                let hasValidCoordinates = false;
                countryBranches.forEach((branch) => {
                    const position = toValidLatLng(
                        branch.geoLocation.latitude,
                        branch.geoLocation.longitude,
                    );
                    if (!position) return;
                    hasValidCoordinates = true;
                    bounds.extend(position);
                });
                if (!hasValidCoordinates) return;

                // Fit bounds with padding
                mapRef.fitBounds(bounds, {
                    top: 50,
                    right: 50,
                    bottom: 50,
                    left: 50,
                });
            }
        }
    }, [direction, mapRef, highestBranchCountCountry, ivfBranches]);

    // Handle zoom to location from table row click
    useEffect(() => {
        if (zoomToLocation && mapRef) {
            mapRef.panTo(zoomToLocation);
            mapRef.setZoom(9);
        }
    }, [zoomToLocation, mapRef]);

    // Handle zoom to IVF branch by branch name (for canister list clicks)
    useEffect(() => {
        if (!zoomToBranchName || !mapRef || ivfBranches.length === 0) return;

        const branch = ivfBranches.find(
            (b) => b.branch_name === zoomToBranchName,
        );
        if (!branch) return;

        const position = toValidLatLng(
            branch.geoLocation.latitude,
            branch.geoLocation.longitude,
        );
        if (!position) return;

        mapRef.panTo(position);
        mapRef.setZoom(9);
    }, [zoomToBranchName, ivfBranches, mapRef]);

    // Auto zoom to selected branch from inbound branch filter
    useEffect(() => {
        if (direction !== "inbound" || !mapRef) return;

        const selectedBranch = filters?.selectedBranch;
        if (!selectedBranch || selectedBranch === "All") return;

        // When branch selection comes from map click, skip this effect to
        // avoid a second delayed zoom animation from parent filter update.
        if (isBranchFilterFromMap) return;

        const branch = ivfBranches.find(
            (b) => b.branch_name === selectedBranch,
        );
        if (!branch) return;

        const position = toValidLatLng(
            branch.geoLocation.latitude,
            branch.geoLocation.longitude,
        );
        if (!position) return;

        mapRef.panTo(position);
        mapRef.setZoom(9);
    }, [
        direction,
        filters?.selectedBranch,
        ivfBranches,
        mapRef,
        isBranchFilterFromMap,
    ]);

    // One-shot zoom for branch marker clicks to guarantee first-click zoom
    // even if map re-renders during filter application.
    useEffect(() => {
        if (!pendingBranchZoomName || !mapRef || ivfBranches.length === 0) {
            return;
        }

        const branch = ivfBranches.find(
            (b) => b.branch_name === pendingBranchZoomName,
        );
        if (!branch) return;

        const position = toValidLatLng(
            branch.geoLocation.latitude,
            branch.geoLocation.longitude,
        );
        if (!position) return;

        mapRef.panTo(position);
        mapRef.setZoom(9);
        setPendingBranchZoomName(null);
    }, [pendingBranchZoomName, ivfBranches, mapRef]);

    // Cleanup polylines on unmount
    useEffect(() => {
        return () => {
            polylinesRef.current.forEach((polyline) => {
                try {
                    google.maps.event.clearInstanceListeners(polyline);
                    polyline.setMap(null);
                } catch (error) {
                    return;
                }
            });
            polylinesRef.current.clear();
        };
    }, []);

    const handleUnmount = useCallback(() => {
        setMapRef(null);
    }, []);

    // Helper function to get color based on route status
    const getRouteColor = useCallback((routeStatus?: string): string => {
        if (!routeStatus) return "#22DC0E"; // Default to safe (green)
        const status = routeStatus.toLowerCase();
        if (status === "safe") return "#22DC0E"; // Green
        if (status === "high_risk" || status === "failed") return "#E80000"; // Red
        if (status === "delayed") return "#FFD901"; // Yellow
        return "#22DC0E"; // Default to safe (green)
    }, []);

    // Helper function to get marker image based on branch status
    const getBranchMarkerIcon = useCallback((branchStatus?: string): string => {
        if (!branchStatus) return MarkerGreen; // Default to safe (green)
        const status = branchStatus.toLowerCase();
        if (status === "safe") return MarkerGreen;
        if (status === "critical" || status === "risk") return MarkerRed;
        if (status === "delayed" || status === "medium") return MarkerYellow;
        return MarkerGreen; // Default to safe (green)
    }, []);

    // Helper function to get status color for dot indicator
    const getBranchStatusColor = useCallback(
        (branchStatus?: string): string => {
            if (!branchStatus) return "#22DC0E"; // Default to safe (green)
            const status = branchStatus.toLowerCase();
            if (status === "safe") return "#22DC0E"; // Green
            if (status === "critical" || status === "risk") return "#E80000"; // Red
            if (status === "delayed" || status === "medium") return "#FFD901"; // Yellow
            return "#22DC0E"; // Default to safe (green)
        },
        [],
    );

    // Helper function to zoom in to a marker position
    const zoomToMarker = useCallback(
        (position: google.maps.LatLngLiteral) => {
            if (!mapRef) return;

            // Pan to position and zoom
            mapRef.panTo(position);
            mapRef.setZoom(9);
        },
        [mapRef],
    );


    return (
        <div className="bg-white border border-[#E7E1E1] rounded-lg relative overflow-hidden w-full h-full lg:min-h-[544px]">
            <div className="absolute inset-0 bg-[#272626]">
                <div className="w-full h-full relative">
                    {/* Undo branch filter overlay (top-left) */}
                    {isBranchFilterFromMap &&
                        direction === "inbound" &&
                        filters?.selectedBranch &&
                        filters.selectedBranch !== "All" && (
                            <div className="absolute top-3 left-3 z-10">
                                <button
                                    type="button"
                                    onClick={() => onClearBranchFilter?.()}
                                    className="bg-white/15 backdrop-blur-sm border border-white/30 rounded-lg px-3 py-2 shadow-sm text-[12px] font-medium text-[#FFFFFF] hover:bg-white/25 transition-colors"
                                >
                                    Clear {filters.selectedBranch}
                                </button>
                            </div>
                        )}

                    {/* Network Status overlay (top-right) */}

                    <div className="absolute top-3 right-3 bg-white/15 backdrop-blur-sm border border-white/30 rounded-lg px-3 py-2 shadow-sm z-10">
                        <div className="flex items-center justify-between gap-6">
                            <div className="text-[12px] font-medium text-[#FFFFFF]">
                                Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>

                    {isLoaded ? (
                        <GoogleMap
                            key={mapInstanceKey}
                            mapContainerStyle={{
                                width: "100%",
                                height: "100%",
                            }}
                            center={mapCenter}
                            zoom={3}
                            options={mapOptions}
                            onLoad={handleLoad}
                            onUnmount={handleUnmount}
                        >
                            {/* Render Routes (Outbound only) */}
                            {direction === "outbound" &&
                                routes.map((r) => {
                                    const origin = toValidLatLng(
                                        r.source_latitude,
                                        r.source_longitude,
                                    );

                                    const dest = toValidLatLng(
                                        r.destination_latitude,
                                        r.destination_longitude,
                                    );

                                    if (!origin || !dest) return null;

                                    const routeKey = `${r.shipment_id}-${r.patient_id}`;
                                    // Calculate midpoint for tooltip position
                                    const midpoint = {
                                        lat:
                                            (origin.lat + dest.lat) / 2,
                                        lng:
                                            (origin.lng + dest.lng) / 2,
                                    } as google.maps.LatLngLiteral;

                                    // Get color based on route status
                                    const routeColor = getRouteColor(
                                        r.route_status,
                                    );

                                    return (
                                        <React.Fragment key={routeKey}>
                                            <AdvancedMarker
                                                key={`${routeKey}-origin`}
                                                position={origin}
                                                dotColor={routeColor}
                                                onClick={() => zoomToMarker(origin)}
                                                onMouseEnter={() => {
                                                    setTooltipPosition((prev) => { const m = new Map(prev); m.set(routeKey, origin); return m; });
                                                    setActiveTooltip(routeKey);
                                                }}
                                                onMouseLeave={() => setActiveTooltip(null)}
                                            />
                                            <AdvancedMarker
                                                key={`${routeKey}-dest`}
                                                position={dest}
                                                dotColor={routeColor}
                                                onClick={() => zoomToMarker(dest)}
                                                onMouseEnter={() => {
                                                    setTooltipPosition((prev) => { const m = new Map(prev); m.set(routeKey, dest); return m; });
                                                    setActiveTooltip(routeKey);
                                                }}
                                                onMouseLeave={() => setActiveTooltip(null)}
                                            />
                                            <Polyline
                                                path={[origin, dest]}
                                                options={{
                                                    strokeColor: routeColor,
                                                    strokeOpacity: 0.95,
                                                    strokeWeight: 3,
                                                    clickable: true,
                                                    zIndex: 1,
                                                }}
                                                onLoad={(polyline) => {
                                                    if (polyline) {
                                                        polylinesRef.current.set(
                                                            routeKey,
                                                            polyline,
                                                        );
                                                        google.maps.event.addListener(
                                                            polyline,
                                                            "mouseover",
                                                            (
                                                                e: google.maps.PolyMouseEvent,
                                                            ) => {
                                                                if (e.latLng) {
                                                                    const hoverPosition =
                                                                        {
                                                                            lat: e.latLng.lat(),
                                                                            lng: e.latLng.lng(),
                                                                        } as google.maps.LatLngLiteral;
                                                                    setTooltipPosition(
                                                                        (
                                                                            prev,
                                                                        ) => {
                                                                            const newMap =
                                                                                new Map(
                                                                                    prev,
                                                                                );
                                                                            newMap.set(
                                                                                routeKey,
                                                                                hoverPosition,
                                                                            );
                                                                            return newMap;
                                                                        },
                                                                    );
                                                                    setActiveTooltip(
                                                                        routeKey,
                                                                    );
                                                                }
                                                            },
                                                        );
                                                        google.maps.event.addListener(
                                                            polyline,
                                                            "mousemove",
                                                            (
                                                                e: google.maps.PolyMouseEvent,
                                                            ) => {
                                                                if (e.latLng) {
                                                                    const hoverPosition =
                                                                        {
                                                                            lat: e.latLng.lat(),
                                                                            lng: e.latLng.lng(),
                                                                        } as google.maps.LatLngLiteral;
                                                                    setTooltipPosition(
                                                                        (
                                                                            prev,
                                                                        ) => {
                                                                            const newMap =
                                                                                new Map(
                                                                                    prev,
                                                                                );
                                                                            newMap.set(
                                                                                routeKey,
                                                                                hoverPosition,
                                                                            );
                                                                            return newMap;
                                                                        },
                                                                    );
                                                                }
                                                            },
                                                        );
                                                        google.maps.event.addListener(
                                                            polyline,
                                                            "mouseout",
                                                            () => {
                                                                setActiveTooltip(
                                                                    null,
                                                                );
                                                            },
                                                        );
                                                    }
                                                }}
                                            />
                                            {activeTooltip === routeKey &&
                                                mapRef && (
                                                    <OverlayView
                                                        position={
                                                            tooltipPosition.get(
                                                                routeKey,
                                                            ) || midpoint
                                                        }
                                                        mapPaneName={
                                                            OverlayView.FLOAT_PANE
                                                        }
                                                        getPixelPositionOffset={(
                                                            width,
                                                            height,
                                                        ) => ({
                                                            x: -(width / 2),
                                                            y: -(height + 10),
                                                        })}
                                                    >
                                                        <div
                                                            className="bg-[#272626] text-white px-3 py-2 rounded text-xs whitespace-nowrap min-w-[200px] pointer-events-none shadow-lg"
                                                            style={{
                                                                zIndex: 9999,
                                                            }}
                                                        >
                                                            {r.source_location}{" "}
                                                            →{" "}
                                                            {
                                                                r.destination_location
                                                            }
                                                        </div>
                                                    </OverlayView>
                                                )}
                                        </React.Fragment>
                                    );
                                })}

                            {/* IVF Branch Markers + Tooltips */}
                            {direction === "inbound" &&
                                displayedIvfBranches.map((branch) => {
                                    const branchKey = `ivf-${branch.state}-${branch.branch_name}`;
                                    const branchPosition = toValidLatLng(
                                        branch.geoLocation.latitude,
                                        branch.geoLocation.longitude,
                                    );
                                    if (!branchPosition) return null;

                                    return (
                                        <React.Fragment key={branchKey}>
                                            <AdvancedMarker
                                                position={branchPosition}
                                                iconUrl={getBranchMarkerIcon(branch.branch_status)}
                                                title={branch.branch_name}
                                                onClick={() => {
                                                    setPendingBranchZoomName(branch.branch_name);
                                                    onBranchSelect?.(branch.branch_name);
                                                    zoomToMarker(branchPosition);
                                                }}
                                                onMouseEnter={() => {
                                                    setTooltipPosition((prev) => { const m = new Map(prev); m.set(branchKey, branchPosition); return m; });
                                                    setActiveTooltip(branchKey);
                                                }}
                                                onMouseLeave={() => setActiveTooltip(null)}
                                            />
                                            {activeTooltip === branchKey &&
                                                mapRef && (
                                                    <OverlayView
                                                        position={
                                                            tooltipPosition.get(
                                                                branchKey,
                                                            ) || branchPosition
                                                        }
                                                        mapPaneName={
                                                            OverlayView.FLOAT_PANE
                                                        }
                                                        getPixelPositionOffset={(
                                                            width,
                                                            height,
                                                        ) => ({
                                                            x: -(width / 2),
                                                            y: -(height + 10),
                                                        })}
                                                    >
                                                        <div
                                                            className="bg-white text-black px-3 py-2 rounded text-xs whitespace-nowrap min-w-[200px] pointer-events-none shadow-lg"
                                                            style={{
                                                                zIndex: 9999,
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                                                    style={{
                                                                        backgroundColor:
                                                                            getBranchStatusColor(
                                                                                branch.branch_status,
                                                                            ),
                                                                    }}
                                                                />
                                                                <div className="font-semibold text-base">
                                                                    {
                                                                        branch
                                                                            .address
                                                                            .district
                                                                    }
                                                                </div>
                                                            </div>
                                                            <div className="text-[10px] text-gray-600 mt-1 ml-4">
                                                                {
                                                                    branch.branch_name
                                                                }{" "}
                                                                |{" "}
                                                                {new Date().toLocaleDateString(
                                                                    "en-GB",
                                                                )}
                                                            </div>
                                                        </div>
                                                    </OverlayView>
                                                )}
                                        </React.Fragment>
                                    );
                                })}
                        </GoogleMap>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white text-xs">
                            Loading map...
                        </div>
                    )}

                    {isLoaded && isMapDataLoading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25">
                            <div className="flex items-center gap-2 rounded-md bg-black/60 px-3 py-2 text-xs text-white">
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                Updating map...
                            </div>
                        </div>
                    )}

                    {/* Legend — (i) popup on mobile, always visible on desktop */}
                    {(() => {
                        const legendContent = (
                            <div className="text-white bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl shadow-lg px-4 py-3 w-[200px]">
                                <div className="text-sm font-semibold mb-3">Cryocan Quality Status</div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3">
                                        <span className="inline-block w-4 h-1.5 rounded-full bg-[#22DC0E]" />
                                        <span className="text-[12px]">Safe</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="inline-block w-4 h-1.5 rounded-full bg-[#E80000]" />
                                        <span className="text-[12px]">Critical</span>
                                    </div>
                                </div>
                            </div>
                        );
                        return (
                            <>
                                {/* Mobile: (i) toggle, bottom-right */}
                                <div className="absolute bottom-6 right-6 z-10 lg:hidden">
                                    <InfoPopup align="right">{legendContent}</InfoPopup>
                                </div>
                                {/* Desktop: always visible, bottom-left */}
                                <div className="absolute bottom-6 left-6 z-10 hidden lg:block">
                                    {legendContent}
                                </div>
                            </>
                        );
                    })()}

                    {/* Custom zoom controls */}

                    <div className="absolute left-6 bottom-6 lg:bottom-[140px] z-10">
                        <div className="flex flex-col items-stretch rounded-xl border border-white/40 shadow-[0_2px_10px_rgba(0,0,0,0.45)] overflow-hidden backdrop-blur-sm w-[38px] h-[69px] bg-gradient-to-b from-white/[0.28] to-white/[0.08]">
                            <button
                                type="button"
                                aria-label="Zoom in"
                                className="w-full flex-1 text-white text-[20px] leading-none flex items-center justify-center hover:bg-white/10"
                                onClick={() => {
                                    if (!mapRef) return;

                                    const next = Math.min(
                                        (mapRef.getZoom() ?? 3) + 1,
                                        9,
                                    );

                                    mapRef.setZoom(next);
                                }}
                            >
                                +
                            </button>

                            <div className="h-px bg-white/40 mx-2" />

                            <button
                                type="button"
                                aria-label="Zoom out"
                                className="w-full flex-1 text-white text-[20px] leading-none flex items-center justify-center hover:bg-white/10"
                                onClick={() => {
                                    if (!mapRef) return;

                                    const next = Math.max(
                                        (mapRef.getZoom() ?? 3) - 1,
                                        2,
                                    );

                                    mapRef.setZoom(next);
                                }}
                            >
                                –
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="absolute bottom-4 left-4 text-xs text-red-300 bg-black/50 px-2 py-1 rounded z-10">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ControlTowerMap;
