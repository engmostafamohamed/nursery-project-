import i18n from '@/lib/i18n';

export type DateInput = string | number | Date;

/**
 * Maps the active app language to a BCP-47 locale for `Intl`/`toLocale*`
 * formatting. Reading the singleton's `language` at call time keeps the output
 * in sync with the active language; components that display these values
 * already subscribe to language changes via `useTranslation`, so they re-render
 * (and re-format) when the user switches languages.
 */
export function activeLocale(): string {
  return i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';
}

/** Local YYYY-MM-DD for date inputs; unlike toISOString(), this does not shift across time zones. */
export function localDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Locale-aware date (no time). Returns '—' for nullish/invalid input. */
export function formatDate(value: DateInput | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(activeLocale(), options);
}

/** Locale-aware date + time. Returns '—' for nullish/invalid input. */
export function formatDateTime(value: DateInput | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(activeLocale(), options);
}

/** Locale-aware time (hour:minute, 12-hour). Returns '—' for nullish/invalid input. */
export function formatTime(value: DateInput | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit', hour12: true, ...options });
}
