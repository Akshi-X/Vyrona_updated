import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { shipmentService } from "../services/shipmentService";

/**
 * Tenant capabilities, derived entirely from existing data:
 * - department (IVF/CGT) from the profile, cached in localStorage
 * - device presence from the active-device counts the Control Tower already serves
 *
 * This replaces the per-hospital "UI variant" feature flags. Device flags are a
 * proxy — `total > 0` means the tenant has *active* devices of that type right now,
 * not that it owns them. There is no stronger signal server-side today
 * (hospital_type is department-level, not device-level).
 * ponytail: active-count proxy; swap for a backend capability field if it proves flaky.
 */
export interface Capabilities {
    isIVF: boolean;
    isCGT: boolean;
    hasCryotanks: boolean;
    hasIncubators: boolean;
    hasRefrigerators: boolean;
    /** Refrigerator-only tenant: refrigerators but no cryotanks or incubators. */
    isRefrigeratorOnly: boolean;
    /** Device flags still resolving. Department flags are synchronous and always ready. */
    isLoading: boolean;
}

const DEFAULT_CAPABILITIES: Capabilities = {
    isIVF: false,
    isCGT: false,
    hasCryotanks: false,
    hasIncubators: false,
    hasRefrigerators: false,
    isRefrigeratorOnly: false,
    isLoading: false,
};

const CapabilityContext = createContext<Capabilities>(DEFAULT_CAPABILITIES);

export const useCapabilities = () => useContext(CapabilityContext);

function readDepartment(): string {
    try {
        return (localStorage.getItem("department") ?? "").toUpperCase();
    } catch {
        return "";
    }
}

export const CapabilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, token } = useAuth();
    const [dept, setDept] = useState<string>(() => readDepartment());
    const [devices, setDevices] = useState({ cryo: false, inc: false, ref: false });
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isAuthenticated || !token) {
            setDevices({ cryo: false, inc: false, ref: false });
            setDept(readDepartment());
            return;
        }

        setDept(readDepartment());
        let cancelled = false;
        setIsLoading(true);

        (async () => {
            const results = await Promise.allSettled([
                shipmentService.getActiveCanisters(),
                shipmentService.getActiveIncubators(),
                shipmentService.getActiveRefrigerators(),
            ]);
            if (cancelled) return;
            const has = (r: PromiseSettledResult<{ total: number }>) =>
                r.status === "fulfilled" && (r.value?.total ?? 0) > 0;
            setDevices({ cryo: has(results[0]), inc: has(results[1]), ref: has(results[2]) });
            setIsLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, token]);

    const value = useMemo<Capabilities>(() => {
        const { cryo, inc, ref } = devices;
        return {
            isIVF: dept === "IVF",
            isCGT: dept === "CGT",
            hasCryotanks: cryo,
            hasIncubators: inc,
            hasRefrigerators: ref,
            isRefrigeratorOnly: ref && !cryo && !inc,
            isLoading,
        };
    }, [dept, devices, isLoading]);

    return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
};
