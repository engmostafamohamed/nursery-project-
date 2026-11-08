import type { Meal } from './menu';

/** Each meal's icon and tint, the same on every F&B screen. */
export const MEAL_LOOK: Record<Meal, { icon: string; tint: string }> = {
  breakfast: { icon: 'egg_alt', tint: 'bg-warning/10 text-warning' },
  lunch: { icon: 'lunch_dining', tint: 'bg-primary/10 text-primary' },
  snacks: { icon: 'cookie', tint: 'bg-success/10 text-success' },
};

/** A day as the screens name it, in the reader's language. */
export function dayLabel(ymd: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, options);
}
