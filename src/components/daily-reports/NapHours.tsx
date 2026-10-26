import { useEffect, useState } from 'react';

import { napSegments } from '@/lib/dailyReport';
import { cn } from '@/lib/utils';

const STEP_MS = 280;

/**
 * A nap as one 3D bar per hour slept, filling one after another (the last one partly for part of
 * an hour): 2 h 30 min is two full bars and a half one. Nothing to show without a nap time.
 */
export function NapHours({ minutes, label, delayMs = 0, className }: { minutes: number | null; label: string; delayMs?: number; className?: string }) {
  const segments = napSegments(minutes);
  // The bars fill after the first paint; a changed time then moves the fill, and a new hour's bar pops in.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setFilled(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  if (!segments.length) return null;
  return (
    <ol role="img" aria-label={label} className={cn('flex items-end gap-2.5', className)}>
      {segments.map((share, i) => (
        <li key={i} className="pop-3d flex flex-col items-center gap-1.5" style={{ animationDelay: filled ? '0ms' : `${delayMs + i * STEP_MS}ms` }}>
          {/* A glass tube, lit from the top left, that fills with the hour */}
          <span
            className="relative flex h-28 w-10 overflow-hidden rounded-full"
            style={{
              background: 'linear-gradient(90deg, rgb(var(--primary) / 0.07), rgb(var(--primary) / 0.18) 55%, rgb(var(--primary) / 0.07))',
              boxShadow: 'inset 0 2px 6px rgb(0 0 0 / 0.12), 0 8px 14px -8px rgb(var(--primary) / 0.6)',
            }}
          >
            <span
              className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500 ease-out motion-reduce:transition-none"
              style={{
                height: filled ? `${share * 100}%` : '0%',
                transitionDelay: `${i * STEP_MS}ms`,
                background: 'linear-gradient(90deg, rgb(var(--primary) / 0.7), rgb(var(--primary)) 45%, rgb(var(--primary) / 0.6))',
              }}
            >
              <span className="absolute inset-y-2 left-1.5 w-1.5 rounded-full bg-white/45" />
            </span>
            <span className="pointer-events-none absolute left-1.5 top-2 h-5 w-1.5 rounded-full bg-white/60" />
          </span>
          <span aria-hidden="true" className="text-xs font-bold tabular-nums text-on-surface-variant">{i + 1}</span>
        </li>
      ))}
    </ol>
  );
}
