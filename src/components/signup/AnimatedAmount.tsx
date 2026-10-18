import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 450;

/**
 * A money amount that counts to its new value whenever it changes, so a parent sees the total
 * move as they pick packages. It jumps straight there for people who prefer reduced motion, and
 * screen readers hear only the final amount.
 */
export function AnimatedAmount({ value, format, className }: { value: number; format: (amount: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return undefined;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const duration = reduceMotion ? 0 : DURATION_MS;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = duration === 0 ? 1 : Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      // Whole pounds while counting (no flickering piastres), the exact amount at the end.
      const next = progress === 1 ? value : Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden className={className}>
        {format(shown)}
      </span>
      <span className="sr-only" aria-live="polite">
        {format(value)}
      </span>
    </>
  );
}
