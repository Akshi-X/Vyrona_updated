import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
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

interface QualityData {
  patient_id: string;
  temperature: number;
  humidity: number;
  ph_level: number;
  o2_level: number;
  co2_level: number;
  agitation: number;
  timestamp: string;
  thresholds: {
    temperature: { min: number | null; max: number | null; unit: string };
    humidity: { min: number | null; max: number | null; unit: string };
    ph_level: { min: number | null; max: number | null; unit: string };
    o2_level: { min: number | null; max: number | null; unit: string };
    co2_level: { min: number | null; max: number | null; unit: string };
    agitation: { min: number | null; max: number | null; unit: string };
  };
  threshold_violations: {
    temperature: boolean;
    humidity: boolean;
    ph_level: boolean;
    o2_level: boolean;
    co2_level: boolean;
    agitation: boolean;
  };
  violated_parameters: string[];
}

interface DataPoint {
  timestamp: string;
  temperature: number;
  humidity: number;
  ph_level: number;
  o2_level: number;
  co2_level: number;
  agitation: number;
}

const MAX_DATA_POINTS = 30; // Keep last 30 data points

export default function QualityTrackingChart() {
  const { patientId } = useParams<{ patientId: string }>();
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

  // Get base URL for WebSocket
  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/quality/ws`;
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
        
        // Close only if already open; avoid closing while CONNECTING to prevent premature close warnings
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
    
    if (!patientId) {
      setError('Patient ID missing');
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
          
          console.log('Quality WebSocket connected');
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
          isConnectingRef.current = false;

          // Subscribe to patient_id
          if (ws.readyState === WebSocket.OPEN && patientId) {
            ws.send(JSON.stringify({ patient_id: patientId }));
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
              console.log('Subscribed to patient:', data.patient_id);
              return;
            }

            // Check if this is an error message
            if (data.type === 'error') {
              console.error('WebSocket error:', data.message);
              setError(data.message || 'Unknown error');
              // Don't reconnect on authentication/authorization errors
              if (data.message && (data.message.includes('token') || data.message.includes('Invalid patient'))) {
                reconnectAttemptsRef.current = maxReconnectAttempts;
              }
              return;
            }

            // Check if this is quality data (has patient_id and timestamp)
            if (data.patient_id && data.timestamp && data.temperature !== undefined) {
              const qualityData: QualityData = data as QualityData;
              
              // Add new data point
              setDataPoints((prev) => {
                const newPoints = [
                  ...prev,
                  {
                    timestamp: qualityData.timestamp,
                    temperature: qualityData.temperature,
                    humidity: qualityData.humidity,
                    ph_level: qualityData.ph_level,
                    o2_level: qualityData.o2_level,
                    co2_level: qualityData.co2_level,
                    agitation: qualityData.agitation,
                  },
                ];

                // Keep only last MAX_DATA_POINTS
                if (newPoints.length > MAX_DATA_POINTS) {
                  return newPoints.slice(-MAX_DATA_POINTS);
                }
                return newPoints;
              });
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
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
  }, [patientId, token]);

  // Prepare chart data
  const chartData = useMemo(() => {
    // Unified color palette
    const palette = {
      temperature: '#FF6B57', // warm coral
      humidity: '#6C7CFF', // indigo
      ph: '#33C38E', // green
      o2: '#F5B82E', // gold
      co2: '#1DB9C3', // teal
      agitation: '#E46ECB', // magenta
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
          label: 'Temperature (°C)',
          data: dataPoints.map((point) => point.temperature),
          borderColor: palette.temperature,
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.temperature,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'Humidity (%)',
          data: dataPoints.map((point) => point.humidity),
          borderColor: palette.humidity,
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.humidity,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'pH Level',
          data: dataPoints.map((point) => point.ph_level),
          borderColor: palette.ph,
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.ph,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'O₂ Level (%)',
          data: dataPoints.map((point) => point.o2_level),
          borderColor: palette.o2,
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.o2,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'CO₂ Level (%)',
          data: dataPoints.map((point) => point.co2_level),
          borderColor: palette.co2,
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.co2,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'Agitation (%)',
          data: dataPoints.map((point) => point.agitation),
          borderColor: palette.agitation,
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.agitation,
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
            boxWidth: 10,
            boxHeight: 10,
            padding: 16,
            color: '#4B4B4B',
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 12 },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 8,
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
              switch (label) {
                case 'Temperature (°C)':
                  return `Temperature (°C) : ${point.temperature}`;
                case 'Humidity (%)':
                  return `Humidity (%) : ${point.humidity}`;
                case 'pH Level':
                  return `pH Level : ${point.ph_level}`;
                case 'O₂ Level (%)':
                  return `O₂ Level (%) : ${point.o2_level}`;
                case 'CO₂ Level (%)':
                  return `CO₂ Level (%) : ${point.co2_level}`;
                case 'Agitation (%)':
                  return `Agitation (%) : ${point.agitation}`;
                default:
                  return `${label}: ${context.parsed.y}`;
              }
            },
            labelColor: (context: any) => {
              const color = context.dataset.borderColor || '#999999';
              return { borderColor: color, backgroundColor: color, borderWidth: 2 }; 
            },
          },
        },
      },
      layout: { padding: { top: 8, right: 8, bottom: 0, left: 0 } },
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
          // Dynamically compute a headroom above the max observed value
          // Example: if max value is 100, axis shows up to 110
          suggestedMax: (() => {
            const allValues = dataPoints.flatMap((p) => [
              p.temperature,
              p.humidity,
              p.ph_level,
              p.o2_level,
              p.co2_level,
              p.agitation,
            ]);
            if (allValues.length === 0) return 110;
            const maxVal = Math.max(...allValues);
            const roundedToTen = Math.ceil(maxVal / 10) * 10;
            return roundedToTen + 10;
          })(),
          grid: {
            color: 'rgba(0,0,0,0.06)',
            drawBorder: false,
            borderDash: [2, 8],
          },
          ticks: {
            stepSize: 10,
            color: '#6B6B6B',
            font: {
              size: 10,
            },
            callback: function (value: any) {
              return value;
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
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-black text-[16px]">Quality Tracking</h3>
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

      {error && !isConnected && (
        <div className="text-red-500 text-xs mb-2" role="alert">
          {error}
        </div>
      )}

      <div className="h-[220px]">
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


