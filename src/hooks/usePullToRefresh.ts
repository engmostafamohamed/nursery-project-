import { useCallback, useRef, useState } from 'react';

type UsePullToRefreshOptions = {
  onRefresh: () => void | Promise<void>;
  /** Pull distance in px to trigger refresh */
  threshold?: number;
};

export function usePullToRefresh({ onRefresh, threshold = 64 }: UsePullToRefreshOptions) {
  const startY = useRef(0);
  const pullDistance = useRef(0);
  const tracking = useRef(false);
  const inFlight = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const runRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      inFlight.current = false;
      setRefreshing(false);
      pullDistance.current = 0;
    }
  }, [onRefresh]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    tracking.current = true;
    startY.current = e.touches[0].clientY;
    pullDistance.current = 0;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!tracking.current || refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    const y = e.touches[0].clientY;
    const delta = y - startY.current;
    if (delta > 0) {
      pullDistance.current = delta;
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(() => {
    if (!tracking.current) return;
    tracking.current = false;
    if (pullDistance.current >= threshold) {
      void runRefresh();
    }
    pullDistance.current = 0;
  }, [runRefresh, threshold]);

  return {
    containerRef,
    pullHandlers: { onTouchStart, onTouchMove, onTouchEnd },
    refreshing,
  };
}
