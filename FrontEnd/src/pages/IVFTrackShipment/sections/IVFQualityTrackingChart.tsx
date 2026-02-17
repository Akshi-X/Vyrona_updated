import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ivfService } from '../../../services/ivfService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { authUtils } from '../../../utils/auth';
 
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);
 
interface DataPoint {
  timestamp: string;
  temp_internal: number;
  temp_external: number | null;
  shock: number;
}
 
 
const MAX_DATA_POINTS = 30; // Keep last 30 data points
const TIME_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
const INTERVAL_MINUTES = 60; // 1-hour intervals
const INTERVALS_COUNT = 6; // 6 intervals for 6 hours (0, 1, 2, 3, 4, 5 hours ago)

// Helper function to parse timestamp string to Date
const parseTimestamp = (timestamp: string): Date | null => {
  try {
    if (!timestamp) return null;
    
    // Convert "YYYY-MM-DD HH:MM:SS" format to ISO format for better parsing
    // JavaScript's Date constructor can be inconsistent with space-separated dates
    let normalizedTimestamp = timestamp.trim();
    
    // If it's space-separated format, convert to ISO-like format
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(normalizedTimestamp)) {
      normalizedTimestamp = normalizedTimestamp.replace(' ', 'T');
      // Add 'Z' to indicate UTC if no timezone info, or parse as-is
      if (!normalizedTimestamp.includes('Z') && !normalizedTimestamp.includes('+') && !normalizedTimestamp.includes('-', 10)) {
        // No timezone info, parse as local time
        const parsed = new Date(normalizedTimestamp);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
    
    // Try parsing with the normalized timestamp or original
    const parsed = new Date(normalizedTimestamp);
    if (isNaN(parsed.getTime())) {
      // Last resort: try original timestamp
      const fallbackParsed = new Date(timestamp);
      if (isNaN(fallbackParsed.getTime())) {
        return null;
      }
      return fallbackParsed;
    }
    return parsed;
  } catch {
    return null;
  }
};

// Helper function to filter data points within the last 6 hours
const filterDataByTimeWindow = (points: DataPoint[]): DataPoint[] => {
  if (points.length === 0) return points;
  
  const now = new Date().getTime();
  const filtered = points.filter((point) => {
    try {
      const pointDate = parseTimestamp(point.timestamp);
      if (!pointDate) {
        return false; // Exclude invalid timestamps
      }
      const pointTime = pointDate.getTime();
      const timeDiff = now - pointTime;
      // Allow data within the last 6 hours, or data that's up to 10 minutes in the future (clock skew tolerance)
      // Also allow data up to 12 hours old if it's the only data we have
      const maxAge = points.length === 1 ? 2 * TIME_WINDOW_MS : TIME_WINDOW_MS;
      return timeDiff >= -10 * 60 * 1000 && timeDiff <= maxAge;
    } catch {
      return false; // Exclude invalid timestamps
    }
  });
  
  // If filtering removed all points but we had valid points, return the most recent one
  if (filtered.length === 0 && points.length > 0) {
    const validPoints = points.filter(p => parseTimestamp(p.timestamp) !== null);
    if (validPoints.length > 0) {
      // Sort by timestamp and return the most recent
      validPoints.sort((a, b) => {
        const dateA = parseTimestamp(a.timestamp);
        const dateB = parseTimestamp(b.timestamp);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime();
      });
      return [validPoints[0]]; // Return at least one point to show the chart
    }
  }
  
  return filtered;
};

// Helper function to get interval index (0-5) for a timestamp within the 6-hour window
const getIntervalIndex = (timestamp: string): number => {
  try {
    const now = new Date().getTime();
    const pointDate = parseTimestamp(timestamp);
    if (!pointDate) {
      return 0;
    }
    const pointTime = pointDate.getTime();
    const minutesAgo = Math.floor((now - pointTime) / (60 * 1000));
    // Return index 0-5, where 0 is most recent (0-1 hour ago) and 5 is oldest (5-6 hours ago)
    // Handle future timestamps by placing them in interval 0
    const intervalIndex = minutesAgo < 0 ? 0 : Math.floor(minutesAgo / INTERVAL_MINUTES);
    return Math.max(0, Math.min(INTERVALS_COUNT - 1, intervalIndex));
  } catch {
    return 0;
  }
};

// Format timestamp to show hour (for 1-hour intervals)
const formatTimestampToInterval = (minutesAgo: number): string => {
  const now = new Date();
  const intervalTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
  const hours = intervalTime.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:00 ${ampm}`;
};
 
interface IVFQualityTrackingChartProps {
  canisterNumber?: string;
}
 
export default function IVFQualityTrackingChart({ canisterNumber }: IVFQualityTrackingChartProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;
 
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batteryPercentage, setBatteryPercentage] = useState<number | null>(null);
  const [hasReceivedData, setHasReceivedData] = useState(false);
 
  // Get base URL for WebSocket
  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/ivf/quality/ws`;
  };
 
  // Format timestamp for display
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = parseTimestamp(timestamp);
      if (!date) {
        return timestamp;
      }
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes}:${seconds} ${ampm}`;
    } catch {
      return timestamp;
    }
  };
 
  // Cleanup function to close WebSocket properly
  const closeWebSocket = () => {
    if (wsRef.current) {
      try {
        // Remove event handlers to prevent reconnection
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        
        // Close only if already open
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, 'Component unmounting');
        }
      } catch (err) {
        // Error closing WebSocket
      }
      wsRef.current = null;
    }
    
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    isConnectingRef.current = false;
  };
 
  // Fetch initial quality history via REST (shows data immediately in UI)
  useEffect(() => {
    if (!canisterNumber) return;
    ivfService.getQualityHistory(canisterNumber).then((res) => {
      if (!isMountedRef.current) return;
      if (res?.history?.length) {
        const points: DataPoint[] = res.history.map((h) => ({
          timestamp: h.timestamp,
          temp_internal: h.temp_internal,
          temp_external: h.temp_external ?? null,
          shock: h.shock,
        }));
        setDataPoints((prev) => {
          const combined = [...points];
          prev.forEach((p) => {
            if (!combined.some((c) => c.timestamp === p.timestamp)) combined.push(p);
          });
          combined.sort((a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0));
          return combined.slice(-MAX_DATA_POINTS);
        });
        setHasReceivedData(true);
        if (res.history[res.history.length - 1]?.battery_percentage != null) {
          setBatteryPercentage(res.history[res.history.length - 1].battery_percentage!);
        }
      }
    }).catch(() => { /* ignore - WebSocket will provide data */ });
  }, [canisterNumber]);

  // Connect to WebSocket
  useEffect(() => {
    isMountedRef.current = true;
    
    if (!canisterNumber) {
      setError('Canister number missing');
      return;
    }
 
    // Get token from context or cookies as fallback
    const authToken = token || authUtils.getToken();
    if (!authToken) {
      setError('Authentication token missing');
      return;
    }
 
    // Prevent multiple simultaneous connections
    if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
 
    const connectWebSocket = () => {
      // Check if component is still mounted
      if (!isMountedRef.current) {
        return;
      }
 
      // Prevent duplicate connections
      if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED)) {
        return;
      }
 
      try {
        isConnectingRef.current = true;
        const wsUrl = getWebSocketUrl();
        const url = `${wsUrl}?token=${encodeURIComponent(authToken)}`;
        const ws = new WebSocket(url);
 
        ws.onopen = () => {
          if (!isMountedRef.current) {
            ws.close();
            return;
          }
          
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
          isConnectingRef.current = false;
          setHasReceivedData(false);

          // Subscribe to tank_code
          if (ws.readyState === WebSocket.OPEN && canisterNumber) {
            ws.send(JSON.stringify({ tank_code: canisterNumber }));
          }
        };
 
        ws.onmessage = (event) => {
          if (!isMountedRef.current) {
            return;
          }
 
          try {
            const data: any = JSON.parse(event.data);
 
            // Check if this is a subscription confirmation
            if (data.type === 'subscription_confirmed') {
              return;
            }
 
            // Check if this is an error message
            if (data.type === 'error') {
              setError(data.message || 'Unknown error');
              // Don't reconnect on authentication/authorization errors
              if (data.message && (data.message.includes('token') || data.message.includes('Invalid canister'))) {
                reconnectAttemptsRef.current = maxReconnectAttempts;
              }
              return;
            }
 
            // Check if this is quality data (has tank_code, canister_number, or canister_id and timestamp)
            // IVF data uses temp_internal, temp_external, shock (humidity may not be present)
            const hasCanisterId = data.tank_code || data.canister_number || data.canister_id;
            const hasTimestamp = data.timestamp;
            const hasTemperature = data.temperature !== undefined || data.temp_internal !== undefined;
            
            if (hasCanisterId && hasTimestamp && hasTemperature) {
              // Extract IVF field names
              const temp_internal = data.temp_internal !== undefined ? data.temp_internal : data.temperature;
              const temp_external = data.temp_external !== undefined && data.temp_external !== null ? data.temp_external : null;
              const shock = data.shock !== undefined ? data.shock : data.agitation;
              
              // Update battery percentage if available
              if (data.battery_percentage !== undefined && data.battery_percentage !== null) {
                setBatteryPercentage(typeof data.battery_percentage === 'number' ? data.battery_percentage : parseFloat(data.battery_percentage));
              }
              
              // Only add if we have valid numeric values for required fields
              if (temp_internal !== undefined && temp_internal !== null &&
                  shock !== undefined && shock !== null) {
                const qualityData: DataPoint = {
                  timestamp: data.timestamp,
                  temp_internal: typeof temp_internal === 'number' ? temp_internal : parseFloat(temp_internal),
                  temp_external: temp_external !== null ? (typeof temp_external === 'number' ? temp_external : parseFloat(temp_external)) : null,
                  shock: typeof shock === 'number' ? shock : parseFloat(shock),
                };
                
                // Mark that we've received data
                setHasReceivedData(true);
                
                // Add new data point (dedupe by timestamp - REST may have loaded same data)
                setDataPoints((prev) => {
                  if (prev.some((p) => p.timestamp === qualityData.timestamp)) return prev;
                  const newPoints = [...prev, qualityData];
                  return newPoints.length > MAX_DATA_POINTS ? newPoints.slice(-MAX_DATA_POINTS) : newPoints;
                });
              }
            }
          } catch (err) {
            // Error parsing WebSocket message
          }
        };
 
        ws.onerror = () => {
          if (!isMountedRef.current) {
            return;
          }
          
          setIsConnected(false);
          setError('WebSocket connection error');
          isConnectingRef.current = false;
        };
 
        ws.onclose = (event) => {
          if (!isMountedRef.current) {
            return;
          }
 
          setIsConnected(false);
          isConnectingRef.current = false;
 
          // Don't reconnect if:
          // 1. Component is unmounting
          // 2. Close was intentional (code 1000)
          // 3. Authentication failed (code 1008)
          // 4. Max reconnection attempts reached
          if (event.code === 1000 || event.code === 1008) {
            if (event.code === 1008) {
              setError('Authentication failed. Please refresh the page.');
            }
            wsRef.current = null;
            return;
          }
 
          // Attempt to reconnect only if component is still mounted
          if (isMountedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                connectWebSocket();
              }
            }, reconnectDelay);
          } else {
            if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
              setError('Failed to reconnect. Please refresh the page.');
            }
            wsRef.current = null;
          }
        };
 
        wsRef.current = ws;
      } catch (err) {
        setError('Failed to connect to WebSocket');
        setIsConnected(false);
        isConnectingRef.current = false;
      }
    };
 
    connectWebSocket();

    // Periodic cleanup to remove old data points (older than 6 hours)
    const cleanupInterval = setInterval(() => {
      if (isMountedRef.current) {
        setDataPoints((prev) => {
          const filtered = filterDataByTimeWindow(prev);
          // Only update if we actually removed some points
          if (filtered.length !== prev.length) {
            return filtered;
          }
          return prev;
        });
      }
    }, 60000); // Run cleanup every minute

    // Cleanup on unmount or when dependencies change
    return () => {
      isMountedRef.current = false;
      clearInterval(cleanupInterval);
      closeWebSocket();
    };
  }, [canisterNumber, token]);
 
  const chartData = useMemo(() => {
    // Filter data points to only show last 6 hours
    const filteredDataPoints = filterDataByTimeWindow(dataPoints);
    
    const palette = {
      temp_internal: '#8AB6F9',
      temp_external: '#4A90E2',
      shock: '#BDBDBD',
    } as const;

    // Generate 6 interval labels (from 5 hours ago to now, in 1-hour steps)
    const intervalLabels: string[] = [];
    for (let i = INTERVALS_COUNT - 1; i >= 0; i--) {
      const minutesAgo = i * INTERVAL_MINUTES;
      intervalLabels.push(formatTimestampToInterval(minutesAgo));
    }

    // Group data points by interval index (0-5)
    const intervalData: { [key: number]: DataPoint[] } = {};
    filteredDataPoints.forEach((point) => {
      const intervalIndex = getIntervalIndex(point.timestamp);
      if (!intervalData[intervalIndex]) {
        intervalData[intervalIndex] = [];
      }
      intervalData[intervalIndex].push(point);
    });

    // For each interval, get the latest data point (most recent within that interval)
    const intervalValues: { [key: number]: { temp_internal: number; temp_external: number | null; shock: number } } = {};
    Object.keys(intervalData).forEach((key) => {
      const index = parseInt(key);
      const points = intervalData[index];
      if (points.length > 0) {
        // Sort by timestamp and use the most recent point in that interval
        const sortedPoints = points.sort((a, b) => {
          const dateA = parseTimestamp(a.timestamp);
          const dateB = parseTimestamp(b.timestamp);
          if (!dateA || !dateB) return 0;
          const timeA = dateA.getTime();
          const timeB = dateB.getTime();
          return timeB - timeA; // Most recent first
        });
        const latestPoint = sortedPoints[0];
        intervalValues[index] = {
          temp_internal: latestPoint.temp_internal,
          temp_external: latestPoint.temp_external,
          shock: latestPoint.shock,
        };
      }
    });

    // Create data arrays for each interval (0-5, where 0 is most recent)
    const tempInternalData: (number | null)[] = [];
    const tempExternalData: (number | null)[] = [];
    const shockData: (number | null)[] = [];

    for (let i = INTERVALS_COUNT - 1; i >= 0; i--) {
      if (intervalValues[i]) {
        tempInternalData.push(intervalValues[i].temp_internal);
        tempExternalData.push(intervalValues[i].temp_external);
        shockData.push(intervalValues[i].shock);
      } else {
        // No data for this interval, use null
        tempInternalData.push(null);
        tempExternalData.push(null);
        shockData.push(null);
      }
    }

    return {
      labels: intervalLabels,
      datasets: [
        {
          label: 'Temperature Internal (°C)',
          data: tempInternalData,
          borderColor: palette.temp_internal,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.temp_internal,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
          spanGaps: true, // Connect across null values
        },
        {
          label: 'Temperature External (°C)',
          data: tempExternalData,
          borderColor: palette.temp_external,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.temp_external,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
          hidden: tempExternalData.every(v => v === null), // Hide if all values are null
          spanGaps: true, // Connect across null values
        },
        {
          label: 'Shock (G)',
          data: shockData,
          borderColor: palette.shock,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.shock,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
          spanGaps: true, // Connect across null values
        },
      ],
    };
  }, [dataPoints]);
 
  const chartOptions = useMemo(() => {
    // Filter data points to only show last 6 hours (same as chartData)
    const filteredDataPoints = filterDataByTimeWindow(dataPoints);
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
            color: '#4B4B4B',
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 11 },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(20, 20, 20, 0.92)',
          padding: 10,
          cornerRadius: 6,
          caretSize: 6,
          usePointStyle: true,
          boxWidth: 6,
          boxHeight: 6,
          titleMarginBottom: 6,
          bodySpacing: 4,
          titleFont: {
            size: 12,
          },
          bodyFont: {
            size: 11,
          },
          displayColors: true,
          callbacks: {
            title: (items: any[]) => {
              if (!items?.length) return '';
              const index = items[0].dataIndex;
              // Index represents interval (0-5), where 0 is most recent and 5 is oldest
              const intervalIndex = INTERVALS_COUNT - 1 - index; // Reverse to get actual interval index
              const minutesAgo = intervalIndex * INTERVAL_MINUTES;
              const now = new Date();
              const intervalTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
              return formatTimestamp(intervalTime.toISOString());
            },
            label: (context: any) => {
              const value = context.parsed.y;
              if (value === null || value === undefined) return '';

              const label = context.dataset.label || '';
              const fmt = (v: number | null) => {
                if (v === null || v === undefined) return 'N/A';
                return typeof v === 'number' ? (Math.round(v * 10) / 10).toFixed(1) : v;
              };
              return `${label}: ${fmt(value)}`;
            },
            labelPointStyle: (context: any) => {
              const color = context.dataset.borderColor || '#999999';
              return { pointStyle: 'circle', rotation: 0, borderColor: color, backgroundColor: color };
            },
          },
        },
      },
      layout: { padding: { top: 0, right: 8, bottom: 0, left: 0 } },
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: {
          grid: {
            display: true,
            color: 'rgba(0,0,0,0.06)',
            borderDash: [2, 6],
          },
          ticks: {
            color: '#4B4B4B',
            font: {
              size: 11,
            },
            maxRotation: 0,
            minRotation: 0,
            autoSkip: false,
            callback: function (_value: any, index: number) {
              const labels = (this as any).chart.data.labels as string[];
              return labels[index] || '';
            },
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: (() => {
            const allValues = filteredDataPoints.flatMap((p) => [
              p.temp_internal,
              p.temp_external,
              p.shock,
            ].filter(v => v !== null && v !== undefined)) as number[];
            if (allValues.length === 0) return 10;
            const maxVal = Math.max(...allValues);
            const roundedToTen = Math.ceil(maxVal / 10) * 10;
            return roundedToTen + 2;
          })(),
          grid: {
            color: 'rgba(0,0,0,0.06)',
            drawBorder: false,
            borderDash: [2, 8],
          },
          ticks: {
            stepSize: 2,
            color: '#6B6B6B',
            font: {
              size: 10,
            },
          },
          border: {
            display: false,
          },
        },
      },
    };
  }, [dataPoints]);
 
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[460px]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-black text-[16px]">Quality Tracking</h3>
        <div className="flex items-center gap-3">
          {batteryPercentage !== null && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md">
              <svg className="w-5 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {/* Battery outline */}
                <rect x="2" y="7" width="16" height="10" rx="2" fill="none" />
                {/* Battery terminal */}
                <line x1="22" y1="11" x2="22" y2="13" />
                {/* Battery fill - fills from left to right based on percentage */}
                <rect
                  x="3"
                  y="8"
                  width={Math.max(0, Math.min(14, (14 * Math.round(batteryPercentage)) / 100))}
                  height="8"
                  rx="1.5"
                  fill="#9C3AA6"
                />
              </svg>
              <span className="text-xs font-medium text-gray-700">{Math.round(batteryPercentage)}%</span>
            </div>
          )}
          {isConnected && wsRef.current?.readyState === WebSocket.OPEN && (
            <span className="text-xs text-green-600">● Connected</span>
          )}
          {(!isConnected || wsRef.current?.readyState !== WebSocket.OPEN) && !error && (
            <span className="text-xs text-yellow-600">● Connecting...</span>
          )}
          {error && (
            <span className="text-xs text-red-600">● {error}</span>
          )}
        </div>
      </div>
 
      {error && !isConnected && (
        <div className="text-red-500 text-xs mb-2" role="alert">
          {error}
        </div>
      )}
 
      <div className="h-[380px]">
        {filterDataByTimeWindow(dataPoints).length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
            {!isConnected || wsRef.current?.readyState !== WebSocket.OPEN ? (
              'Connecting...'
            ) : isConnected && wsRef.current?.readyState === WebSocket.OPEN && !hasReceivedData ? (
              'No data available'
            ) : (
              'Waiting for data...'
            )}
          </div>
        ) : (
          <Line data={chartData} options={chartOptions as any} />
        )}
      </div>
    </div>
  );
}