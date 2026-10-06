import i18n from '@/lib/i18n';

/**
 * Invoice lines written by the system carry a `kind` (late_pickup, loyalty_discount, tuition,
 * admission_package, discount, event) plus names in both languages instead of words; the app
 * labels them from invoice.itemKinds.*. Lines an admin typed keep their own description.
 */

type RawLineItem = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toLang(language: string | undefined): 'ar' | 'en' {
  return language?.startsWith('en') ? 'en' : 'ar';
}

function formatDay(day: string, lng: 'ar' | 'en'): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00Z` : day);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(lng === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** What one invoice line says, in `language` (defaults to the app language). */
export function invoiceItemDescription(item: RawLineItem, language: string = i18n.language): string {
  const lng = toLang(language);
  const kind = text(item.kind);

  if (kind === 'late_pickup') {
    const day = text(item.attendance_date);
    return i18n.t('invoice.itemKinds.late_pickup', { lng, date: day ? formatDay(day, lng) : '' });
  }
  if (kind === 'loyalty_discount') {
    return i18n.t('invoice.itemKinds.loyalty_discount', { lng, points: Number(item.points ?? 0) });
  }

  // Older system lines stored description (English) + description_ar; typed lines only description.
  const ar = text(item.name_ar) || (kind ? '' : text(item.description_ar));
  const en = text(item.name_en) || (kind ? '' : text(item.description));
  const named = lng === 'ar' ? ar || en : en || ar;
  if (named) return named;
  if (kind && i18n.exists(`invoice.itemKinds.${kind}`, { lng })) return i18n.t(`invoice.itemKinds.${kind}`, { lng });
  return text(item.description);
}

/** The invoice-level note: what an admin wrote, or the standard note for an admission package. */
export function invoiceNotes(raw: unknown, language: string = i18n.language): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const obj = raw as { notes?: unknown; application_payment?: unknown };
  const notes = text(obj.notes);
  if (notes) return notes;
  return obj.application_payment === true ? i18n.t('invoice.notes.applicationPackage', { lng: toLang(language) }) : '';
}

/** The line items of line_items_json, which is either a bare array or { items: [...] }. */
export function invoiceRawItems(raw: unknown): RawLineItem[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : [];
  return source.filter((row): row is RawLineItem => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
}
