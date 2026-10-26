import { useEffect, useId, useState } from 'react';

import { MEAL_SHARE, mealPortions, type Meal, type MealAmount } from '@/lib/dailyReport';
import { cn } from '@/lib/utils';

/** Four portions per meal, one per quarter of the plate, in the order they are served. */
const PORTIONS: Record<Meal, [string, string, string, string]> = {
  breakfast: ['🍳', '🍞', '🧀', '🍅'],
  lunch: ['🍚', '🍗', '🥦', '🥕'],
  snacks: ['🍎', '🍌', '🍇', '🍪'],
};

// Where each portion sits on the plate (viewBox 120 × 96, the plate's well centred at 60, 48):
// back right, front right, front left, back left — so the plate fills round, like a clock.
const SPOTS: { x: number; y: number; front: boolean }[] = [
  { x: 79, y: 39, front: false },
  { x: 77, y: 57, front: true },
  { x: 43, y: 57, front: true },
  { x: 41, y: 39, front: false },
];

const VIEW_W = 120;
const VIEW_H = 96;
const STAGGER_MS = 170;

/** A small still plate for a choice: the share it stands for, as a slice. */
export function MealShareIcon({ amount, className }: { amount: MealAmount; className?: string }) {
  const share = MEAL_SHARE[amount];
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className={cn('shrink-0', className)}>
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      {share > 0 ? (
        <circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="7" pathLength={100} strokeDasharray={`${share * 100} 100`} transform="rotate(-90 10 10)" />
      ) : null}
    </svg>
  );
}

/**
 * A plate seen at an angle, with a portion of food for each quarter the child ate: a quarter is one
 * portion, all four is the whole plate (and a tick). Portions drop onto the plate one after another
 * when it first shows (`delayMs` staggers several plates), and straight away when the amount
 * changes. `amount` null is a question not answered yet: an empty plate with a dashed well.
 */
export function MealPlate({
  meal,
  amount,
  label,
  size = 96,
  delayMs = 0,
  className,
}: {
  meal: Meal;
  amount: MealAmount | null;
  /** What a screen reader hears, e.g. "Lunch: half the plate". */
  label: string;
  /** The widest the plate grows; it shrinks with its column on a phone. */
  size?: number;
  delayMs?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const portions = mealPortions(amount);
  // The first portions come in one after another; later ones (a changed answer) drop at once.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), delayMs + 4 * STAGGER_MS + 600);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return (
    // Sized by its container (the food is in cqw, a share of the plate's width), so it stays round on any screen.
    <span
      role="img"
      aria-label={label}
      className={cn('relative inline-block w-full shrink-0 [container-type:inline-size]', className)}
      style={{ maxWidth: size, aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id={`${id}-top`} cx="45%" cy="35%" r="70%">
            <stop offset="0%" style={{ stopColor: 'rgb(var(--surface))' }} />
            <stop offset="75%" style={{ stopColor: 'rgb(var(--surface))' }} />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--surface-high))' }} />
          </radialGradient>
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'rgb(var(--surface-high))' }} />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--border-subtle))' }} />
          </linearGradient>
          <radialGradient id={`${id}-well`} cx="50%" cy="65%" r="65%">
            <stop offset="0%" style={{ stopColor: 'rgb(var(--surface))' }} />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--surface-low))' }} />
          </radialGradient>
          <filter id={`${id}-blur`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {/* On the table: the plate's shadow, its side, its rim and the well */}
        <ellipse cx="60" cy="66" rx="52" ry="18" fill="rgb(0 0 0 / 0.22)" filter={`url(#${id}-blur)`} />
        <ellipse cx="60" cy="54" rx="56" ry="31" fill={`url(#${id}-edge)`} />
        <ellipse cx="60" cy="48" rx="56" ry="31" fill={`url(#${id}-top)`} style={{ stroke: 'rgb(var(--border-subtle))' }} strokeWidth="1" />
        <ellipse
          cx="60"
          cy="49"
          rx="42"
          ry="22"
          fill={`url(#${id}-well)`}
          style={{ stroke: 'rgb(var(--border-subtle))' }}
          strokeWidth="1.5"
          strokeDasharray={amount === null ? '4 4' : undefined}
        />
        <path d="M 14 42 Q 24 22 60 19" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round" />
        {/* Each portion's shadow on the plate */}
        {SPOTS.map((spot, i) => (
          <ellipse
            key={i}
            cx={spot.x}
            cy={spot.y + (spot.front ? 9 : 7)}
            rx={spot.front ? 12 : 10}
            ry={spot.front ? 3.5 : 3}
            fill="rgb(0 0 0 / 0.18)"
            className="transition-opacity duration-500 motion-reduce:transition-none"
            style={{ opacity: i < portions ? 1 : 0 }}
          />
        ))}
      </svg>

      {/* The food: back portions first, so the front ones sit over them */}
      {SPOTS.map((spot, i) =>
        i < portions ? (
          <span
            key={`${meal}-${i}`}
            aria-hidden="true"
            className="plate-portion-drop absolute leading-none drop-shadow-sm"
            style={{
              left: `${(spot.x / VIEW_W) * 100}%`,
              top: `${(spot.y / VIEW_H) * 100}%`,
              fontSize: spot.front ? '21cqw' : '18cqw',
              zIndex: spot.front ? 2 : 1,
              animationDelay: settled ? '0ms' : `${delayMs + i * STAGGER_MS}ms`,
            }}
          >
            {PORTIONS[meal][i]}
          </span>
        ) : null,
      )}

      {amount === 'all' ? (
        <span
          aria-hidden="true"
          className="absolute bottom-0 end-0 z-10 flex items-center justify-center rounded-full bg-success text-white shadow-md animate-in zoom-in-50 fill-mode-both duration-500 motion-reduce:animate-none"
          style={{ width: '24cqw', height: '24cqw', animationDelay: settled ? '0ms' : `${delayMs + 4 * STAGGER_MS + 200}ms` }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16cqw' }}>check</span>
        </span>
      ) : null}
    </span>
  );
}
