import type { PillTone } from '@/lib/tones';

/** How full a class is: the share of its places taken, how many children are over, and its tone. */
export type CapacityFill = { pct: number | null; over: number; tone: PillTone };

/**
 * Green while there is room, amber from 90% full, red over capacity. A class without a capacity has
 * no share and is never over.
 */
export function capacityFill(children: number, capacity: number | null): CapacityFill {
  if (capacity === null || capacity <= 0) return { pct: null, over: 0, tone: 'primary' };
  const pct = (children / capacity) * 100;
  return { pct, over: Math.max(0, children - capacity), tone: pct > 100 ? 'error' : pct >= 90 ? 'warning' : 'success' };
}
