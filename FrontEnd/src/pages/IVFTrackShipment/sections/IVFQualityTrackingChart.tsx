import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
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
  humidity: number;
  shock: number;
}


const MAX_DATA_POINTS = 30; // Keep last 30 data points

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
      const date = new Date(timestamp);
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
        console.error('Error closing WebSocket:', err);
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

          // Subscribe to canister_number
          if (ws.readyState === WebSocket.OPEN && canisterNumber) {
            ws.send(JSON.stringify({ canister_number: canisterNumber }));
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
              console.log('IVF WebSocket subscription confirmed:', data);
              return;
            }

            // Check if this is an error message
            if (data.type === 'error') {
              console.error('WebSocket error:', data.message);
              setError(data.message || 'Unknown error');
              // Don't reconnect on authentication/authorization errors
              if (data.message && (data.message.includes('token') || data.message.includes('Invalid canister'))) {
                reconnectAttemptsRef.current = maxReconnectAttempts;
              }
              return;
            }

            // Check if this is quality data (has canister_number or canister_id and timestamp)
            // IVF data uses temp_internal, temp_external, humidity, and shock
            const hasCanisterId = data.canister_number || data.canister_id;
            const hasTimestamp = data.timestamp;
            const hasTemperature = data.temperature !== undefined || data.temp_internal !== undefined;
            
            if (hasCanisterId && hasTimestamp && hasTemperature) {
              // Extract IVF field names
              const temp_internal = data.temp_internal !== undefined ? data.temp_internal : data.temperature;
              const temp_external = data.temp_external !== undefined && data.temp_external !== null ? data.temp_external : null;
              const humidity = data.humidity;
              const shock = data.shock !== undefined ? data.shock : data.agitation;
              
              // Update battery percentage if available
              if (data.battery_percentage !== undefined && data.battery_percentage !== null) {
                setBatteryPercentage(typeof data.battery_percentage === 'number' ? data.battery_percentage : parseFloat(data.battery_percentage));
              }
              
              // Only add if we have valid numeric values for required fields
              if (temp_internal !== undefined && temp_internal !== null && 
                  humidity !== undefined && humidity !== null && 
                  shock !== undefined && shock !== null) {
                const qualityData: DataPoint = {
                  timestamp: data.timestamp,
                  temp_internal: typeof temp_internal === 'number' ? temp_internal : parseFloat(temp_internal),
                  temp_external: temp_external !== null ? (typeof temp_external === 'number' ? temp_external : parseFloat(temp_external)) : null,
                  humidity: typeof humidity === 'number' ? humidity : parseFloat(humidity),
                  shock: typeof shock === 'number' ? shock : parseFloat(shock),
                };
                
                console.log('Received IVF quality data:', qualityData);
                
                // Add new data point
                setDataPoints((prev) => {
                  const newPoints = [
                    ...prev,
                    qualityData,
                  ];

                  // Keep only last MAX_DATA_POINTS
                  if (newPoints.length > MAX_DATA_POINTS) {
                    return newPoints.slice(-MAX_DATA_POINTS);
                  }
                  return newPoints;
                });
              } else {
                console.warn('IVF quality data missing required fields:', { temp_internal, humidity, shock, data });
              }
            } else {
              // Log other message types for debugging
              if (data.type !== 'ivf_geolocation_history') {
                console.log('Received WebSocket message (not quality data):', data.type || 'unknown', Object.keys(data));
              }
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err, event.data);
          }
        };

        ws.onerror = (error) => {
          if (!isMountedRef.current) {
            return;
          }
          
          console.error('WebSocket error:', error);
          setIsConnected(false);
          setError('WebSocket connection error');
          isConnectingRef.current = false;
        };

        ws.onclose = (event) => {
          if (!isMountedRef.current) {
            return;
          }

          console.log('WebSocket closed', event.code, event.reason);
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
                console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
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
        console.error('Failed to create WebSocket connection:', err);
        setError('Failed to connect to WebSocket');
        setIsConnected(false);
        isConnectingRef.current = false;
      }
    };

    connectWebSocket();

    // Cleanup on unmount or when dependencies change
    return () => {
      isMountedRef.current = false;
      closeWebSocket();
    };
  }, [canisterNumber, token]);

  const chartData = useMemo(() => {
    const palette = {
      temp_internal: '#8AB6F9',
      temp_external: '#4A90E2',
      humidity: '#DE88E6',
      shock: '#BDBDBD',
    } as const;

    const labels = dataPoints.map((point) => formatTimestamp(point.timestamp));
    
    // Show only first, middle, and last labels to avoid clutter
    const displayLabels = labels.map((label, index) => {
      if (labels.length <= 4) return label;
      if (index === 0) return label;
      if (index === Math.floor(labels.length / 2)) return label;
      if (index === labels.length - 1) return label;
      return '';
    });

    return {
      labels: displayLabels,
      datasets: [
        {
          label: 'Temperature Internal (°C)',
          data: dataPoints.map((point) => point.temp_internal),
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
        },
        {
          label: 'Temperature External (°C)',
          data: dataPoints.map((point) => point.temp_external),
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
          hidden: dataPoints.every(p => p.temp_external === null), // Hide if all values are null
        },
        {
          label: 'Humidity (%)',
          data: dataPoints.map((point) => point.humidity),
          borderColor: palette.humidity,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.humidity,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'Shock (G)',
          data: dataPoints.map((point) => point.shock),
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
        },
      ],
    };
  }, [dataPoints]);

  const chartOptions = useMemo(
    () => ({
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
              return dataPoints[index] ? formatTimestamp(dataPoints[index].timestamp) : '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const point = dataPoints[index];
              if (!point) return '';

              const label = context.dataset.label || '';
              const fmt = (v: number | null) => {
                if (v === null || v === undefined) return 'N/A';
                return typeof v === 'number' ? (Math.round(v * 10) / 10).toFixed(1) : v;
              };
              switch (label) {
                case 'Temperature Internal (°C)':
                  return `Temperature Internal (°C): ${fmt(point.temp_internal)}`;
                case 'Temperature External (°C)':
                  return `Temperature External (°C): ${fmt(point.temp_external)}`;
                case 'Humidity (%)':
                  return `Humidity (%): ${fmt(point.humidity)}`;
                case 'Shock (G)':
                  return `Shock (G): ${fmt(point.shock)}`;
                default:
                  return `${label}: ${context.parsed.y}`;
              }
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
            const allValues = dataPoints.flatMap((p) => [
              p.temp_internal,
              p.temp_external,
              p.humidity,
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
    }),
    [dataPoints]
  );

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
          {isConnected && (
            <span className="text-xs text-green-600">● Connected</span>
          )}
          {!isConnected && !error && (
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
        {dataPoints.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
            {isConnected ? 'Waiting for data...' : 'Connecting...'}
          </div>
        ) : (
          <Line data={chartData} options={chartOptions as any} />
        )}
      </div>
    </div>
  );
}

