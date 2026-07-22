interface TimeScaleMarker {
  percent: number;
  label: string;
  subLabel?: string;
}

interface TimeScaleProps {
  timelineStart: Date;
  timelineEnd: Date;
  timeRange: string;
  containerWidth: number;
}

export const TimeScale: React.FC<TimeScaleProps> = ({
  timelineStart,
  timelineEnd,
  timeRange,
  containerWidth,
}) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getMarkers = (): TimeScaleMarker[] => {
    const markers: TimeScaleMarker[] = [];

    if (!timelineStart || !timelineEnd || isNaN(timelineStart.getTime()) || isNaN(timelineEnd.getTime())) {
      return markers;
    }

    const start = timelineStart.getTime();
    const end = timelineEnd.getTime();
    const totalMs = end - start;

    if (totalMs <= 0) {
      return markers;
    }

    // Calculate how many markers can fit based on container width
    // Each label needs ~60px minimum spacing to avoid overlap
    const minPixelSpacing = 60;
    const validContainerWidth = Math.max(600, containerWidth || 600);
    const maxMarkers = Math.max(2, Math.floor(validContainerWidth / minPixelSpacing));

    // Determine base interval based on time range
    let baseIntervalMs: number;

    switch (timeRange) {
      case '1H':
        baseIntervalMs = 15 * 60 * 1000; // 15 minutes
        break;
      case '24H':
        baseIntervalMs = 6 * 60 * 60 * 1000; // 6 hours
        break;
      case '7D':
        baseIntervalMs = 24 * 60 * 60 * 1000; // 1 day
        break;
      case 'CUSTOM':
        baseIntervalMs = 6 * 60 * 60 * 1000; // 6 hours
        break;
      default:
        baseIntervalMs = 6 * 60 * 60 * 1000;
    }

    // Dynamically adjust interval to fit within available space
    let interval = baseIntervalMs;
    let estimatedMarkerCount = Math.floor(totalMs / interval) + 1;

    // Keep doubling interval until markers fit
    while (estimatedMarkerCount > maxMarkers && interval < totalMs / 2) {
      interval *= 2;
      estimatedMarkerCount = Math.floor(totalMs / interval) + 1;
    }

    // Add all markers including start and end
    for (let current = start; current <= end; current += interval) {
      const percent = ((current - start) / totalMs) * 100;
      const date = new Date(current);
      const showDate = timeRange === '24H' || timeRange === '7D';

      markers.push({
        percent: Math.min(percent, 100),
        label: formatTime(date),
        subLabel: showDate ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
      });
    }

    // Ensure the end marker is always included if not already
    const endDate = new Date(end);
    const showDate = timeRange === '24H' || timeRange === '7D';

    const hasEndMarker = markers.some((m) => m.percent === 100);
    if (!hasEndMarker) {
      markers.push({
        percent: 100,
        label: formatTime(endDate),
        subLabel: showDate ? endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
      });
    }

    return markers;
  };

  const markers = getMarkers();

  return (
    <div className="w-full relative">
      <div style={{ position: 'relative', height: '40px' }}>
        {markers.map((marker, idx) => (
          <div
            key={`scale-marker-${idx}`}
            className="flex flex-col items-center"
            style={{
              position: 'absolute',
              left: `${marker.percent}%`,
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
            }}
          >
            <div className="w-0.5 h-2 bg-gray-400 mb-1" />
            <div className="text-xs text-gray-600 font-medium whitespace-nowrap">
              {marker.label}
            </div>
            {marker.subLabel && (
              <div className="text-[10px] text-gray-400 whitespace-nowrap">
                {marker.subLabel}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
