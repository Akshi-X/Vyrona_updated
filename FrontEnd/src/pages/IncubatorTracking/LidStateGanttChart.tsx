import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TimeScale } from './TimeScale';

interface LidEvent {
  start_timestamp: string;
  stop_timestamp: string;
  alert_count?: number;
}

interface LidStateGanttChartProps {
  events: LidEvent[];
  timeRange?: string;
}

export const LidStateGanttChart: React.FC<LidStateGanttChartProps> = ({ events, timeRange = '24H' }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      setContainerWidth(containerRef.current?.clientWidth || 600);
    });

    resizeObserver.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth || 600);

    return () => resizeObserver.disconnect();
  }, []);

  const getTimelineStart = () => {
    if (events.length === 0) return new Date();
    const firstEventDate = new Date(events[0].start_timestamp);

    switch (timeRange) {
      case '1H': {
        // Start from the beginning of the hour containing the first event
        const hourStart = new Date(firstEventDate);
        hourStart.setMinutes(0, 0, 0);
        return hourStart;
      }
      case '24H': {
        // Rolling window: last 24 hours from current time
        return new Date(Date.now() - 24 * 60 * 60 * 1000);
      }
      case '7D': {
        // Rolling window: last 7 days from current time
        return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }
      case 'CUSTOM': {
        // Start from 00:00 of the selected day
        const dayStart = new Date(firstEventDate);
        dayStart.setHours(0, 0, 0, 0);
        return dayStart;
      }
      default:
        return firstEventDate;
    }
  };

  const getTimelineEnd = () => {
    if (events.length === 0) return new Date();
    const firstEventDate = new Date(events[0].start_timestamp);

    switch (timeRange) {
      case '1H': {
        // End at the end of the hour containing the first event (start + 60 minutes)
        const start = getTimelineStart();
        return new Date(start.getTime() + 60 * 60 * 1000);
      }
      case '24H':
      case '7D': {
        // Rolling window ends at current time
        return new Date();
      }
      case 'CUSTOM': {
        // End at 23:59 of the same day
        const dayEnd = new Date(firstEventDate);
        dayEnd.setHours(23, 59, 59, 999);
        return dayEnd;
      }
      default:
        return new Date(firstEventDate.getTime() + 60 * 60 * 1000);
    }
  };

  const timelineStart = getTimelineStart();
  const timelineEnd = getTimelineEnd();

  const getPositionPercent = (timestamp: string) => {
    const time = new Date(timestamp).getTime();
    const start = timelineStart.getTime();
    const end = timelineEnd.getTime();
    return ((time - start) / (end - start)) * 100;
  };

  const getDurationPercent = (startTime: string, stopTime: string) => {
    const start = new Date(startTime).getTime();
    const stop = new Date(stopTime).getTime();
    const timelineStart_ = timelineStart.getTime();
    const timelineEnd_ = timelineEnd.getTime();
    return ((stop - start) / (timelineEnd_ - timelineStart_)) * 100;
  };

  const formatDuration = (startTime: string, stopTime: string) => {
    const seconds = Math.round((new Date(stopTime).getTime() - new Date(startTime).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };


  return (
    <div className="w-full h-full flex flex-col items-center justify-end px-6 py-8">
      <div className="w-full">
        {/* Event blocks section */}
        <div ref={containerRef} className="relative w-full mb-6" style={{ height: '60px' }}>
          {events.length > 0 ? (
            events.map((event, idx) => {
              const startPercent = getPositionPercent(event.start_timestamp);
              const durationPercent = getDurationPercent(event.start_timestamp, event.stop_timestamp);
              const startTime = new Date(event.start_timestamp);
              const stopTime = new Date(event.stop_timestamp);
              // Min width in pixels so short opens stay visible without ballooning
              const minWidthPercent = (10 / containerWidth) * 100;
              const widthPercent = Math.max(durationPercent, minWidthPercent);
              const widthPx = (widthPercent / 100) * containerWidth;
              const showLabel = widthPx >= 44;

              return (
                <div
                  key={`lid-event-${idx}`}
                  className="absolute top-1/2 transform -translate-y-1/2"
                  style={{ left: `${startPercent}%`, width: `${widthPercent}%`, zIndex: hoveredIdx === idx ? 60 : undefined }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltipAnchor({ x: rect.left + rect.width / 2, y: rect.top });
                    setHoveredIdx(idx);
                  }}
                  onMouseLeave={() => {
                    setHoveredIdx(null);
                    setTooltipAnchor(null);
                  }}
                >
                  {/* Alert count badge */}
                  {(event.alert_count ?? 0) > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col items-center pointer-events-none">
                      <div className="bg-[#E11D2A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-4 min-w-[18px] text-center">
                        {(event.alert_count ?? 0) > 99 ? '99+' : event.alert_count}
                      </div>
                      <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#E11D2A]" />
                    </div>
                  )}

                  {/* Duration bar/blob */}
                  <div
                    className="relative h-12 rounded-lg border flex items-center justify-center font-bold text-xs transition-all cursor-pointer hover:shadow-lg border-purple-500 text-purple-900"
                    style={{
                      backgroundImage: `repeating-linear-gradient(
                        45deg,
                        #d1a3d8,
                        #d1a3d8 20px,
                        #ce93d8 20px,
                        #ce93d8 40px
                      )`,
                    }}
                  >
                    {showLabel && (
                      <span className="text-xs text-black font-semibold whitespace-nowrap">
                        {formatDuration(event.start_timestamp, event.stop_timestamp)}
                      </span>
                    )}

                    {/* Start/end lines and time labels - show on hover */}
                    {hoveredIdx === idx && (
                      <>
                        <div className="absolute -left-0.5 top-1/2 w-0.5 h-5 bg-black" style={{ marginTop: '12px' }} />
                        <div className="absolute -right-0.5 top-1/2 w-0.5 h-5 bg-black" style={{ marginTop: '12px' }} />
                        {widthPx >= 96 ? (
                          <>
                            <div className="absolute top-1/2 text-xs text-gray-700 whitespace-nowrap" style={{ marginTop: '33px', left: '-6px', transform: 'translateX(-50%)' }}>
                              {startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </div>
                            <div className="absolute top-1/2 text-xs text-gray-700 whitespace-nowrap" style={{ marginTop: '33px', right: '-6px', transform: 'translateX(50%)' }}>
                              {stopTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </div>
                          </>
                        ) : (
                          <div className="absolute top-1/2 text-xs text-gray-700 whitespace-nowrap" style={{ marginTop: '33px', left: '50%', transform: 'translateX(-50%)' }}>
                            {startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            {' - '}
                            {stopTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Tooltip on hover — portaled so no ancestor stacking context can cover it */}
                  {hoveredIdx === idx && tooltipAnchor &&
                    createPortal(
                      <div
                        className="fixed bg-gray-900 text-white px-3 py-2 rounded-lg whitespace-nowrap text-xs shadow-lg pointer-events-none"
                        style={{
                          left: tooltipAnchor.x,
                          top: tooltipAnchor.y - 8,
                          transform: 'translate(-50%, -100%)',
                          zIndex: 10000,
                        }}
                      >
                        <div className="font-semibold">Lid Open Event</div>
                        <div>Start: {startTime.toLocaleString()}</div>
                        <div>Stop: {stopTime.toLocaleString()}</div>
                        <div>Duration: {formatDuration(event.start_timestamp, event.stop_timestamp)}</div>
                        {(event.alert_count ?? 0) > 0 && <div className="text-red-300">Alerts: {event.alert_count}</div>}
                      </div>,
                      document.body
                    )}
                </div>
              );
            })
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              No lid open events
            </div>
          )}
        </div>

        {/* Timeline line */}
        <div className="w-full h-px border-t-2 border-dotted border-gray-400 mb-4" />

        {/* Time scale component */}
        {timelineStart && timelineEnd && (
          <TimeScale
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            timeRange={timeRange}
            containerWidth={containerWidth}
          />
        )}
      </div>
    </div>
  );
};
