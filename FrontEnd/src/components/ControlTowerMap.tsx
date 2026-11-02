import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    useRef,
} from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { shipmentService } from "../services/shipmentService";
import MarkerGreen from "../assets/ControlTower/MarkerGreen.svg";
import MarkerRed from "../assets/ControlTower/MarkerRed.svg";
import MarkerYellow from "../assets/ControlTower/MarkerYellow.svg";

// 100% Free, open-source OpenFreeMap dark vector style (no API keys, billing, or watermarks)
const OPEN_FREE_MAP_DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

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
    zoomToLocation?: { lat: number; lng: number } | null;
    zoomToBranchName?: string | null;
    onBranchSelect?: (branchName: string) => void;
    isBranchFilterFromMap?: boolean;
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
): { lat: number; lng: number } | null => {
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
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const popupRef = useRef<maplibregl.Popup | null>(null);

    const [routes, setRoutes] = useState<MapRoute[]>([]);
    const [ivfBranches, setIvfBranches] = useState<IVFBranch[]>([]);
    const [highestBranchCountCountry, setHighestBranchCountCountry] = useState<
        string | null
    >(null);

    const getRouteColor = useCallback((routeStatus?: string): string => {
        if (!routeStatus) return "#22DC0E";
        const status = routeStatus.toLowerCase();
        if (status === "safe") return "#22DC0E";
        if (status === "high_risk" || status === "failed") return "#E80000";
        if (status === "delayed") return "#FFD901";
        return "#22DC0E";
    }, []);

    const getBranchMarkerIcon = useCallback((branchStatus?: string): string => {
        if (!branchStatus) return MarkerGreen;
        const status = branchStatus.toLowerCase();
        if (status === "safe") return MarkerGreen;
        if (status === "critical" || status === "risk") return MarkerRed;
        if (status === "delayed" || status === "medium") return MarkerYellow;
        return MarkerGreen;
    }, []);

    const getBranchStatusColor = useCallback((branchStatus?: string): string => {
        if (!branchStatus) return "#22DC0E";
        const status = branchStatus.toLowerCase();
        if (status === "safe") return "#22DC0E";
        if (status === "critical" || status === "risk") return "#E80000";
        if (status === "delayed" || status === "medium") return "#FFD901";
        return "#22DC0E";
    }, []);

    const displayedIvfBranches = useMemo(() => {
        let branches = ivfBranches;
        if (filters?.selectedBranch && filters.selectedBranch !== "All") {
            branches = branches.filter(
                (b) => b.branch_name === filters.selectedBranch,
            );
        }
        return branches;
    }, [ivfBranches, filters?.selectedBranch]);

    // Initialize MapLibre GL map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: OPEN_FREE_MAP_DARK_STYLE,
            center: [78.9629, 20.5937], // Centered on India
            zoom: 3.5,
            attributionControl: false,
        });

        // Add standard navigation controls (zoom in / zoom out)
        map.addControl(
            new maplibregl.NavigationControl({ showCompass: false }),
            "bottom-right",
        );

        popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: "vyrona-map-popup",
        });

        mapRef.current = map;

        return () => {
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];
            popupRef.current?.remove();
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Load data based on direction and filters
    useEffect(() => {
        let mounted = true;
        setRoutes([]);
        setIvfBranches([]);

        if (direction === "inbound") {
            let department: string | null = null;
            try {
                department = localStorage.getItem("department");
            } catch {
                department = null;
            }
            if (department && department.toUpperCase() !== "IVF") {
                setIvfBranches([]);
                setHighestBranchCountCountry(null);
                return;
            }

            (async () => {
                try {
                    const [controlTowerResult, activeCanistersResult] =
                        await Promise.allSettled([
                            shipmentService.getIVFControlTower(),
                            shipmentService.getActiveCanisters(),
                        ]);

                    if (controlTowerResult.status !== "fulfilled") return;

                    const data = controlTowerResult.value;
                    const branchStatusByName =
                        activeCanistersResult.status === "fulfilled"
                            ? getBranchStatusMapFromActiveCanisters(
                                  activeCanistersResult.value,
                              )
                            : new Map<string, string>();

                    if (mounted && data.states) {
                        const highestCountry =
                            data.highest_branch_count_country || null;
                        setHighestBranchCountCountry(highestCountry);

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

                        if (
                            filters?.selectedStatus &&
                            filters.selectedStatus !== "All"
                        ) {
                            const normalizedFilterStatus =
                                filters.selectedStatus.toLowerCase();
                            branches = branches.filter((b) => {
                                const branchStatus =
                                    b.branch_status?.toLowerCase() || "";
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
                    console.warn("Failed to load IVF control tower data:", e);
                }
            })();
        } else {
            (async () => {
                try {
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
                        const routesData = Array.isArray(data)
                            ? data
                            : (data as any)?.routes || [];
                        setRoutes(routesData);
                    }
                } catch (e: any) {
                    console.warn("Failed to load map routes:", e);
                }
            })();
        }

        return () => {
            mounted = false;
        };
    }, [
        direction,
        filters?.selectedRegion,
        filters?.selectedStatus,
        filters?.selectedCarrier,
    ]);

    // Render IVF Markers (Inbound)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || direction !== "inbound") return;

        // Clear existing markers
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        if (displayedIvfBranches.length === 0) return;

        const bounds = new maplibregl.LngLatBounds();
        let hasValidCoords = false;

        displayedIvfBranches.forEach((branch) => {
            const { latitude, longitude } = branch.geoLocation;
            if (
                latitude == null ||
                longitude == null ||
                isNaN(latitude) ||
                isNaN(longitude)
            )
                return;

            const markerEl = document.createElement("div");
            markerEl.className =
                "cursor-pointer transform hover:scale-125 transition-transform duration-200";
            markerEl.id = `map-marker-${branch.branch_name}`;

            const img = document.createElement("img");
            img.src = getBranchMarkerIcon(branch.branch_status);
            img.style.width = "28px";
            img.style.height = "28px";
            img.style.display = "block";
            markerEl.appendChild(img);

            const popupContent = `
                <div style="background:#272626;color:#ffffff;padding:10px 14px;border-radius:8px;font-family:sans-serif;font-size:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);min-width:180px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="width:10px;height:10px;border-radius:50%;background:${getBranchStatusColor(branch.branch_status)};display:inline-block;flex-shrink:0;"></span>
                        <div style="font-weight:700;font-size:14px;color:#ffffff;">${branch.address.district || branch.branch_name}</div>
                    </div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:4px;margin-left:18px;">
                        ${branch.branch_name} | ${new Date().toLocaleDateString("en-GB")}
                    </div>
                </div>
            `;

            markerEl.addEventListener("mouseenter", () => {
                if (popupRef.current) {
                    popupRef.current
                        .setLngLat([longitude, latitude])
                        .setHTML(popupContent)
                        .addTo(map);
                }
            });

            markerEl.addEventListener("mouseleave", () => {
                popupRef.current?.remove();
            });

            markerEl.addEventListener("click", () => {
                map.flyTo({ center: [longitude, latitude], zoom: 9, duration: 1000 });
                onBranchSelect?.(branch.branch_name);
            });

            const marker = new maplibregl.Marker({ element: markerEl })
                .setLngLat([longitude, latitude])
                .addTo(map);

            markersRef.current.push(marker);
            bounds.extend([longitude, latitude]);
            hasValidCoords = true;
        });

        if (hasValidCoords && !filters?.selectedBranch) {
            if (highestBranchCountCountry) {
                const countryBranches = displayedIvfBranches.filter(
                    (b) => b.country_name === highestBranchCountCountry,
                );
                if (countryBranches.length > 0) {
                    const countryBounds = new maplibregl.LngLatBounds();
                    countryBranches.forEach((b) =>
                        countryBounds.extend([b.geoLocation.longitude, b.geoLocation.latitude]),
                    );
                    map.fitBounds(countryBounds, { padding: 60, maxZoom: 8, duration: 800 });
                    return;
                }
            }
            map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 800 });
        }
    }, [
        displayedIvfBranches,
        direction,
        highestBranchCountCountry,
        getBranchMarkerIcon,
        getBranchStatusColor,
        onBranchSelect,
        filters?.selectedBranch,
    ]);

    // Render Routes & Markers (Outbound)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || direction !== "outbound") return;

        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        const updateLayers = () => {
            // Remove existing route layers/sources if present
            if (map.getLayer("routes-line")) map.removeLayer("routes-line");
            if (map.getSource("routes-source")) map.removeSource("routes-source");

            if (routes.length === 0) return;

            const features: any[] = [];
            const bounds = new maplibregl.LngLatBounds();
            let hasValidCoords = false;

            routes.forEach((r) => {
                const origin = toValidLatLng(r.source_latitude, r.source_longitude);
                const dest = toValidLatLng(r.destination_latitude, r.destination_longitude);
                if (!origin || !dest) return;

                const color = getRouteColor(r.route_status);
                features.push({
                    type: "Feature",
                    properties: {
                        color,
                        description: `${r.source_location} → ${r.destination_location}`,
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [origin.lng, origin.lat],
                            [dest.lng, dest.lat],
                        ],
                    },
                });

                // Origin dot
                const originEl = document.createElement("div");
                originEl.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-sizing:border-box;cursor:pointer;`;
                const originMarker = new maplibregl.Marker({ element: originEl })
                    .setLngLat([origin.lng, origin.lat])
                    .addTo(map);
                markersRef.current.push(originMarker);

                // Dest dot
                const destEl = document.createElement("div");
                destEl.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-sizing:border-box;cursor:pointer;`;
                const destMarker = new maplibregl.Marker({ element: destEl })
                    .setLngLat([dest.lng, dest.lat])
                    .addTo(map);
                markersRef.current.push(destMarker);

                bounds.extend([origin.lng, origin.lat]);
                bounds.extend([dest.lng, dest.lat]);
                hasValidCoords = true;
            });

            map.addSource("routes-source", {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features,
                },
            });

            map.addLayer({
                id: "routes-line",
                type: "line",
                source: "routes-source",
                layout: {
                    "line-join": "round",
                    "line-cap": "round",
                },
                paint: {
                    "line-color": ["get", "color"],
                    "line-width": 3,
                    "line-opacity": 0.95,
                },
            });

            if (hasValidCoords) {
                map.fitBounds(bounds, { padding: 50, maxZoom: 6, duration: 800 });
            }
        };

        if (map.isStyleLoaded()) {
            updateLayers();
        } else {
            map.once("style.load", updateLayers);
        }
    }, [routes, direction, getRouteColor]);

    // Handle zoom to location (e.g., from table row click)
    useEffect(() => {
        if (zoomToLocation && mapRef.current) {
            mapRef.current.flyTo({
                center: [zoomToLocation.lng, zoomToLocation.lat],
                zoom: 9,
                duration: 1000,
            });
        }
    }, [zoomToLocation]);

    // Handle zoom to branch name
    useEffect(() => {
        if (!zoomToBranchName || !mapRef.current || ivfBranches.length === 0) return;
        const branch = ivfBranches.find((b) => b.branch_name === zoomToBranchName);
        if (!branch) return;
        const pos = toValidLatLng(branch.geoLocation.latitude, branch.geoLocation.longitude);
        if (!pos) return;
        mapRef.current.flyTo({ center: [pos.lng, pos.lat], zoom: 9, duration: 1000 });
    }, [zoomToBranchName, ivfBranches]);

    // Handle filter branch zoom
    useEffect(() => {
        if (direction !== "inbound" || !mapRef.current) return;
        const selectedBranch = filters?.selectedBranch;

        if (!selectedBranch || selectedBranch === "All") {
            if (ivfBranches.length === 0) return;
            const bounds = new maplibregl.LngLatBounds();
            let hasValid = false;
            ivfBranches.forEach((b) => {
                const pos = toValidLatLng(b.geoLocation.latitude, b.geoLocation.longitude);
                if (!pos) return;
                bounds.extend([pos.lng, pos.lat]);
                hasValid = true;
            });
            if (hasValid) {
                mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 800 });
            }
            return;
        }

        if (isBranchFilterFromMap) return;

        const branch = ivfBranches.find((b) => b.branch_name === selectedBranch);
        if (!branch) return;
        const pos = toValidLatLng(branch.geoLocation.latitude, branch.geoLocation.longitude);
        if (!pos) return;
        mapRef.current.flyTo({ center: [pos.lng, pos.lat], zoom: 9, duration: 1000 });
    }, [direction, filters?.selectedBranch, ivfBranches, isBranchFilterFromMap]);

    return (
        <div className="bg-white border border-line rounded-lg relative overflow-hidden w-full h-full lg:min-h-[544px]">
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
                                Last updated:{" "}
                                {new Date().toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </div>
                        </div>
                    </div>

                    {/* MapLibre GL Map Canvas */}
                    <div ref={mapContainerRef} className="w-full h-full" />
                </div>
            </div>
        </div>
    );
};

export default ControlTowerMap;
