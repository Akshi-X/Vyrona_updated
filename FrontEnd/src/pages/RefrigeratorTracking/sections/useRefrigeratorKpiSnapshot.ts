import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { authUtils } from '../../../utils/auth';
import { ivfService } from '../../../services/ivfService';

const REFRIGERATOR_KPI_ORDER = [
  'refrigerator_humidity',
  'refrigerator_temp',
] as const;

const KPI_LABELS: Record<string, string> = {
  refrigerator_humidity: 'Humidity',
  refrigerator_temp: 'Temperature',
};

const KPI_UNITS: Record<string, string> = {
  refrigerator_humidity: '%',
  refrigerator_temp: '°C',
};

const parseTimestampToMs = (timestamp?: string): number | null => {
  if (!timestamp || typeof timestamp !== 'string') return null;
  const raw = timestamp.trim().replace(' ', 'T');
  const trimmedMicroseconds = raw.replace(/(\.\d{3})\d+/, '$1');
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(trimmedMicroseconds);
  const normalized = hasTimezone ? trimmedMicroseconds : `${trimmedMicroseconds}Z`;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeKpiValue = (rawValue: unknown): number | null => {
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : null;
  if (typeof rawValue === 'string') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatKpiValue = (value: number | null, unit: string): string => {
  if (value == null) return '-';
  return `${value.toFixed(1)}${unit}`;
};

const formatTimeAgo = (nowTs: number, timestampMs: number | null): string | null => {
  if (timestampMs == null) return null;
  const diffMs = Math.max(0, nowTs - timestampMs);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return 'just now';
  if (diffMinutes === 1) return '1 min ago';
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 6) / 10;
    return `${hours} hours ago`;
  }
  return `${diffMinutes} min ago`;
};

export type RefrigeratorSensorTile = {
  id: 'temp_external' | 'probe_temp';
  label: string;
  value: string;
  timestamp: string | null;
  isMissing: boolean;
  history: number[];
};

type LatestKpi = {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  tsMs: number;
};

export type RefrigeratorKpiSnapshot = {
  sensorTiles: RefrigeratorSensorTile[];
  tempExternal: number | null;
  probeTemp: number | null;
  isInitialLoading: boolean;
};

type UseRefrigeratorKpiSnapshotOptions = {
  refrigeratorId?: string;
  zoneId?: string | null;
  enabled?: boolean;
};

export function useRefrigeratorKpiSnapshot({
  refrigeratorId,
  zoneId,
  enabled = true,
}: UseRefrigeratorKpiSnapshotOptions): RefrigeratorKpiSnapshot {
  const normalizedRefrigeratorId = refrigeratorId != null ? String(refrigeratorId) : undefined;
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const latestKpiTimestampRef = useRef<Record<string, number>>({});
  const kpiHistoryRef = useRef<Record<string, number[]>>({});

  const [latestByName, setLatestByName] = useState<Record<string, LatestKpi>>({});
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [nowTs, setNowTs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    return `${baseUrl.replace(/^http/, 'ws')}/api/ivf/quality/refrigerator-kpi-ws`;
  };

  const updateLatest = (incoming: LatestKpi[]) => {
    if (!incoming.length) return;
    setLatestByName((prev) => {
      const next = { ...prev };
      let hasUpdate = false;
      for (const kpi of incoming) {
        const prevTs = latestKpiTimestampRef.current[kpi.name];
        if (prevTs != null && kpi.tsMs < prevTs) continue;
        latestKpiTimestampRef.current[kpi.name] = kpi.tsMs;
        next[kpi.name] = kpi;
        const hist = kpiHistoryRef.current[kpi.name] ?? [];
        hist.push(kpi.value);
        if (hist.length > 20) hist.splice(0, hist.length - 20);
        kpiHistoryRef.current[kpi.name] = hist;
        hasUpdate = true;
      }
      return hasUpdate ? next : prev;
    });
  };

  useEffect(() => {
    if (!enabled || !normalizedRefrigeratorId) return;
    setIsInitialLoading(true);
    latestKpiTimestampRef.current = {};
    kpiHistoryRef.current = {};
    setLatestByName({});

    const idNum = Number(normalizedRefrigeratorId);
    if (!Number.isFinite(idNum)) {
      setIsInitialLoading(false);
      return;
    }

    ivfService
      .getRefrigeratorZoneLatest(idNum, zoneId ?? undefined)
      .then((rows) => {
        if (!isMountedRef.current) return;
        const now = Date.now();
        const entries: LatestKpi[] = rows
          .filter((r) => r.value != null)
          .map((r) => ({
            name: r.kpi_name,
            value: Number(r.value),
            unit: r.unit || '',
            timestamp: new Date(now).toISOString(),
            tsMs: now,
          }));
        updateLatest(entries);
      })
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current) setIsInitialLoading(false);
      });
  }, [normalizedRefrigeratorId, zoneId, enabled]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled || !normalizedRefrigeratorId) return;
    const authToken = token || authUtils.getToken();
    if (!authToken) return;

    const params = new URLSearchParams({ token: authToken });
    const ws = new WebSocket(`${getWebSocketUrl()}?${params.toString()}`);

    ws.onopen = () => {
      const idNum = Number(normalizedRefrigeratorId);
      ws.send(JSON.stringify({
        refrigerator_id: Number.isFinite(idNum) ? idNum : normalizedRefrigeratorId,
        ...(zoneId != null ? { zone_id: zoneId } : {}),
      }));
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const data: any = JSON.parse(event.data);
        if (data.type === 'subscription_confirmed' || data.type === 'error') return;
        const incomingKpis: LatestKpi[] = Array.isArray(data.kpis)
          ? data.kpis
              .map((k: any) => {
                const name = typeof k?.name === 'string' ? k.name.trim() : '';
                if (!name) return null;
                const value = normalizeKpiValue(k?.value);
                if (value == null) return null;
                const ts =
                  typeof k?.timestamp === 'string'
                    ? k.timestamp
                    : typeof data?.timestamp === 'string'
                      ? data.timestamp
                      : undefined;
                const tsMs = parseTimestampToMs(ts);
                if (tsMs == null || !ts) return null;
                return { name, value, unit: k?.unit || '', timestamp: ts, tsMs };
              })
              .filter((k: LatestKpi | null): k is LatestKpi => k != null)
          : [];

        const messageMatches =
          data.refrigerator_id == null ||
          String(data.refrigerator_id) === normalizedRefrigeratorId;
        const zoneMatches =
          zoneId == null || data.zone_id == null || data.zone_id === zoneId;
        if (messageMatches && zoneMatches && incomingKpis.length) updateLatest(incomingKpis);
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => {};
    wsRef.current = ws;

    return () => {
      isMountedRef.current = false;
      try {
        wsRef.current?.close(1000, 'unmount');
      } catch {}
      wsRef.current = null;
    };
  }, [normalizedRefrigeratorId, zoneId, token, enabled]);

  const sensorTiles = useMemo<RefrigeratorSensorTile[]>(() => {
    const dynamicKeys = Object.keys(latestByName);
    const orderedKeys = dynamicKeys.length > 0
      ? dynamicKeys
      : Array.from(REFRIGERATOR_KPI_ORDER);
    return orderedKeys.map((id) => {
      const latest = latestByName[id];
      const value = latest ? latest.value : null;
      const tsMs = latest ? latest.tsMs : null;
      return {
        id: id as 'temp_external' | 'probe_temp',
        label: KPI_LABELS[id] ?? id,
        value: formatKpiValue(value, latest?.unit || KPI_UNITS[id] || '°C'),
        timestamp: formatTimeAgo(nowTs, tsMs),
        isMissing: value == null,
        history: kpiHistoryRef.current[id]?.slice() ?? [],
      };
    });
  }, [latestByName, nowTs]);

  return {
    sensorTiles,
    tempExternal: latestByName['temp_external']?.value ?? null,
    probeTemp: latestByName['probe_temp']?.value ?? null,
    isInitialLoading,
  };
}
