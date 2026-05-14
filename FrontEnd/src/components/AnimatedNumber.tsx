import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  isLoading?: boolean;
  loadingPlaceholder?: string;
  errorValue?: string | number;
  hasError?: boolean;
  duration?: number;
  className?: string;
}

/**
 * Animates a number from 0 to the target value when it changes.
 * Skips animation for loading/error states.
 */
export function AnimatedNumber({
  value,
  isLoading = false,
  loadingPlaceholder = '--',
  errorValue = '0',
  hasError = false,
  duration = 1200,
  className = '',
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (isLoading || hasError) return;

    const target = Math.max(0, Math.floor(value));
    if (target === 0) {
      setDisplayValue(0);
      return;
    }

    let startTime: number;
    let rafId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for smooth deceleration at the end
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      setDisplayValue(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [value, isLoading, hasError, duration]);

  if (isLoading) return <span className={className}>{loadingPlaceholder}</span>;
  if (hasError) return <span className={className}>{String(errorValue)}</span>;
  return <span className={className}>{displayValue.toLocaleString()}</span>;
}
