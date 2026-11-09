/* Formatting and page helpers the health profile's parts share (no React). */

export type Tone = 'error' | 'warning' | 'success' | 'primary' | 'neutral';

/** Tinted background and text for icon tiles, per tone. */
export const TILE: Record<Tone, string> = {
  error: 'bg-error/10 text-error',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  primary: 'bg-primary/10 text-primary',
  neutral: 'bg-surface-high text-on-surface-variant',
};

/** A date as "9 Nov 2026" in the reader's language. */
export function formatDay(date: string | null | undefined, isArabic: boolean): string {
  if (!date) return '';
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(isArabic ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Scrolls to a part of the profile (the page keeps its address). */
export function goToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const sectionId = (section: string) => `health-${section}`;
