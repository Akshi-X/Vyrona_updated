import { useEffect, useState } from 'react';
import { ivfService } from '../../../services/ivfService';

/**
 * KPI names configured under Alert Settings for a refrigerator zone. Used to scope
 * live socket pushes — the device reports KPIs (tive_battery_percentage) that have
 * no kpi_config for the zone and must not surface as tiles or charts.
 */
export function useRefrigeratorAlertKpiNames(
  refrigeratorId?: number,
  zoneId?: string | null,
  enabled = true,
): string[] | null {
  // null means "config not known yet" (still loading, disabled, or the request
  // failed) — callers keep showing everything. An array is authoritative, so an
  // empty one legitimately means this zone has no configured KPIs.
  const [kpiNames, setKpiNames] = useState<string[] | null>(null);

  useEffect(() => {
    if (!enabled || refrigeratorId == null) {
      setKpiNames(null);
      return;
    }

    let ignore = false;
    ivfService
      .getKpiConfigList(refrigeratorId, 'refrigerator', zoneId ?? undefined)
      .then((res) => {
        if (ignore) return;
        setKpiNames((res.config ?? []).map((row) => row.kpi_name).filter(Boolean));
      })
      .catch(() => {
        if (!ignore) setKpiNames(null);
      });

    return () => {
      ignore = true;
    };
  }, [enabled, refrigeratorId, zoneId]);

  return kpiNames;
}
