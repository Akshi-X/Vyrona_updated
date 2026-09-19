/**
 * Shared IST-anchored timestamp formatting for KPI quality-tracking charts
 * (incubator, cryocan). All display must use IST regardless of the viewer's
 * browser timezone — using the browser's local zone (`toLocaleTimeString`
 * with no explicit timeZone) was the bug this module fixes: chart axes and
 * tooltips would silently show times shifted by whatever offset the browser
 * happened to be in instead of the clinic's actual wall-clock time.
 */

export const IST_TIME_ZONE = "Asia/Kolkata";

/** Parses a timestamp string, assuming UTC when no timezone suffix is present. */
export const parseTimestamp = (timestamp: string): Date | null => {
    try {
        if (!timestamp) return null;
        const normalized = timestamp.trim().replace(" ", "T");
        const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(normalized);
        const toParse = hasTimezone ? normalized : `${normalized}Z`;
        const parsed = new Date(toParse);
        return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
        return null;
    }
};

/** Chart x-axis label: "HH:MM" in IST; with includeDate, prefixed "MMM D, ". */
export const formatTimeLabel = (timestamp: string, includeDate = false): string => {
    const date = parseTimestamp(timestamp);
    if (!date) return timestamp;
    const timePart = date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: IST_TIME_ZONE,
    });
    if (!includeDate) return timePart;
    const datePart = date.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        timeZone: IST_TIME_ZONE,
    });
    return `${datePart}, ${timePart}`;
};

/** Tooltip label: date + time in IST, no seconds. */
export const formatDateTimeLabel = (timestamp: string): string => {
    const date = parseTimestamp(timestamp);
    if (!date) return timestamp;
    const datePart = date.toLocaleDateString("en-IN", {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
        timeZone: IST_TIME_ZONE,
    });
    const timePart = date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: IST_TIME_ZONE,
    });
    return `${datePart}, ${timePart}`;
};

/**
 * "DD/M - h:mmAM" in IST for a single instant. Day/month come from the same
 * IST-shifted moment as the time — reading them via Date.getDate()/getMonth()
 * (browser-local) instead can land on the wrong calendar day relative to the
 * IST time shown alongside it.
 */
export const formatISTDayMonthTime = (d: Date): string => {
    const parts = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "numeric",
        timeZone: IST_TIME_ZONE,
    }).formatToParts(d);
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    const mon = parts.find((p) => p.type === "month")?.value ?? "";
    const time = d
        .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST_TIME_ZONE })
        .toUpperCase()
        .replace(" ", "");
    return `${day}/${mon} - ${time}`;
};
