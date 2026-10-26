import { useId, type CSSProperties, type ReactNode } from 'react';

import type { PillTone } from '@/lib/tones';
import { cn } from '@/lib/utils';

// The daily report's 3D shapes: a glossy ball (mood, nap), a water drop (toilet visits) and a
// raised tile (activities). Lit from the top left and shaded with the theme's tone colours, so
// they follow the light, soft and dark themes. They pop in (`pop-3d`) unless motion is reduced.

const TONE_VAR: Record<PillTone, string> = {
  primary: '--primary',
  success: '--success',
  warning: '--warning',
  error: '--error',
  neutral: '--border-strong',
};

const popIn = (delayMs: number): { className: string; style: CSSProperties } => ({
  className: 'pop-3d',
  style: { animationDelay: `${delayMs}ms` },
});

/** A glossy ball with an emoji in it, sitting on its shadow. */
export function Orb3D({
  tone,
  size = 72,
  delayMs = 0,
  animate = true,
  className,
  children,
}: {
  tone: PillTone;
  size?: number;
  delayMs?: number;
  /** False for a ball that should just be there (a choice button). */
  animate?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const c = `var(${TONE_VAR[tone]})`;
  const motion = animate ? popIn(delayMs) : null;
  return (
    <span aria-hidden="true" className={cn('relative inline-flex shrink-0 flex-col items-center', motion?.className, className)} style={{ width: size, ...motion?.style }}>
      <span
        className="relative z-[1] flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.95) 0%, rgb(${c} / 0.35) 32%, rgb(${c} / 0.8) 78%, rgb(${c}) 100%)`,
          boxShadow: `inset -${size * 0.08}px -${size * 0.1}px ${size * 0.18}px rgb(0 0 0 / 0.18), inset ${size * 0.05}px ${size * 0.06}px ${size * 0.12}px rgb(255 255 255 / 0.45), 0 ${size * 0.12}px ${size * 0.22}px -${size * 0.08}px rgb(${c} / 0.6)`,
        }}
      >
        <span className="leading-none" style={{ fontSize: size * 0.52, filter: 'drop-shadow(0 3px 2px rgb(0 0 0 / 0.25))' }}>
          {children}
        </span>
        <span className="pointer-events-none absolute rounded-full bg-white/60 blur-[1px]" style={{ width: size * 0.28, height: size * 0.14, top: size * 0.12, insetInlineStart: size * 0.2 }} />
      </span>
      <span className="-mt-1 rounded-full bg-black/15 blur-[3px]" style={{ width: size * 0.7, height: size * 0.12 }} />
    </span>
  );
}

/** A water drop, lit from the top left: one per toilet visit. */
export function Drop3D({ size = 36, delayMs = 0, className }: { size?: number; delayMs?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const motion = popIn(delayMs);
  return (
    <svg viewBox="0 0 24 30" width={size} height={size * 1.25} aria-hidden="true" className={cn('shrink-0 overflow-visible', motion.className, className)} style={motion.style}>
      <defs>
        <radialGradient id={`${id}-drop`} cx="35%" cy="55%" r="70%">
          <stop offset="0%" style={{ stopColor: 'rgb(255 255 255)', stopOpacity: 0.95 }} />
          <stop offset="35%" style={{ stopColor: 'rgb(var(--primary))', stopOpacity: 0.55 }} />
          <stop offset="100%" style={{ stopColor: 'rgb(var(--primary))' }} />
        </radialGradient>
      </defs>
      <ellipse cx="12" cy="28.5" rx="7" ry="1.5" fill="rgb(0 0 0 / 0.18)" />
      <path d="M12 1.5C12 1.5 3.5 11.5 3.5 17.5a8.5 8.5 0 0 0 17 0C20.5 11.5 12 1.5 12 1.5Z" fill={`url(#${id}-drop)`} />
      <ellipse cx="8.6" cy="15" rx="1.8" ry="3.2" fill="white" fillOpacity="0.75" transform="rotate(20 8.6 15)" />
    </svg>
  );
}

/** A raised tile with an emoji and a label: an activity of the day (or a choice of one). */
export function Tile3D({
  emoji,
  label,
  tone = 'success',
  selected = true,
  delayMs = 0,
  animate = true,
  className,
}: {
  emoji: string;
  label: string;
  tone?: PillTone;
  /** A tile not picked is flat and grey; a picked one stands up in its tone. */
  selected?: boolean;
  delayMs?: number;
  animate?: boolean;
  className?: string;
}) {
  const c = `var(${TONE_VAR[tone]})`;
  const motion = animate ? popIn(delayMs) : null;
  return (
    <span
      className={cn(
        'relative flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center text-sm font-semibold transition-[transform,box-shadow,background] duration-200',
        selected ? 'text-on-surface' : 'bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant',
        motion?.className,
        className,
      )}
      style={{
        ...motion?.style,
        ...(selected
          ? {
              background: `linear-gradient(160deg, rgb(255 255 255 / 0.9) 0%, rgb(${c} / 0.16) 45%, rgb(${c} / 0.32) 100%)`,
              boxShadow: `0 4px 0 0 rgb(${c} / 0.55), 0 10px 18px -8px rgb(${c} / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.8)`,
            }
          : undefined),
      }}
    >
      <span aria-hidden="true" className="text-3xl leading-none" style={{ filter: selected ? 'drop-shadow(0 3px 2px rgb(0 0 0 / 0.25))' : 'grayscale(0.6) opacity(0.75)' }}>
        {emoji}
      </span>
      <span className="leading-tight">{label}</span>
    </span>
  );
}
