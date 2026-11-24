import type { ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';

/*
 * Recharts' ResponsiveContainer starts at -1 × -1 until it has measured its box, and on that first
 * render it prints "The width(-1) and height(-1) of chart should be greater than 0" to the console,
 * in production builds too. Starting at 0 × 1 is just as unmeasured (a chart draws nothing until
 * both sides are positive, so nothing changes on screen) without the false alarm.
 */
const UNMEASURED = { width: 0, height: 1 };

/** A chart that fills its box: give the box a height, and put one Recharts chart inside. */
export function ResponsiveChart({ children }: { children: ComponentProps<typeof ResponsiveContainer>['children'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={UNMEASURED}>
      {children}
    </ResponsiveContainer>
  );
}
