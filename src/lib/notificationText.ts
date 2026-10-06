import i18n from '@/lib/i18n';

/**
 * Notifications store a template key and raw parameters; the words live only in the locale
 * files under notificationTemplates.<key> ({ title, body, segments }). Rows written before
 * templates, and messages people typed themselves (broadcasts, personal reminders), keep their
 * stored title/body and render as-is.
 *
 * Parameter conventions (shared with the SQL that writes them):
 *   { ar, en }          localized data (names): the reader's language, else the other one
 *   { i18n: 'key' }     a translated label
 *   time / *_time       ISO timestamp, shown as a clock time in `tz`
 *   date / *_date       YYYY-MM-DD calendar day
 *   month               YYYY-MM, shown as month and year
 *   amount/fee/refund/rate  money in `currency`
 *   segments            optional sentence parts appended to the body, in order
 */

/** Columns a notification list must select to render rows (template or stored text). */
export const NOTIFICATION_TEXT_COLUMNS = 'title_ar, title_en, body_ar, body_en, template_key, template_params';

export type NotificationTextRow = {
  title_ar?: string | null;
  title_en?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  template_key?: string | null;
  template_params?: unknown;
};

export type NotificationText = { title: string; body: string };

type Lang = 'ar' | 'en';

const MONEY_KEYS = new Set(['amount', 'fee', 'refund', 'rate']);

function toLang(language: string | undefined): Lang {
  return language?.startsWith('en') ? 'en' : 'ar';
}

function localeFor(lang: Lang): string {
  return lang === 'ar' ? 'ar-EG' : 'en-GB';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickLocalized(ar: unknown, en: unknown, lang: Lang): string {
  const a = typeof ar === 'string' ? ar.trim() : '';
  const e = typeof en === 'string' ? en.trim() : '';
  return lang === 'ar' ? a || e : e || a;
}

function formatMoney(value: number, currency: string, lang: Lang): string {
  const amount = value.toFixed(2);
  return currency === 'EGP' ? i18n.t('invoice.egpAmount', { amount, lng: lang }) : `${amount} ${currency}`;
}

function formatClock(iso: string, tz: string | undefined, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  try {
    return d.toLocaleTimeString(localeFor(lang), { ...options, timeZone: tz });
  } catch {
    // Unknown time zone name: fall back to the device's.
    return d.toLocaleTimeString(localeFor(lang), options);
  }
}

function formatDay(value: string, tz: string | undefined, lang: Lang): string {
  // A bare YYYY-MM-DD is a calendar day: read and print it in UTC so no offset moves it.
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dayOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  try {
    return d.toLocaleDateString(localeFor(lang), { ...options, timeZone: dayOnly ? 'UTC' : tz });
  } catch {
    return d.toLocaleDateString(localeFor(lang), options);
  }
}

function formatParam(key: string, value: unknown, lang: Lang, tz: string | undefined, currency: string): string | number {
  if (value == null) return '';
  if (isRecord(value)) {
    if (typeof value.i18n === 'string') return i18n.t(value.i18n, { lng: lang });
    if ('ar' in value || 'en' in value) return pickLocalized(value.ar, value.en, lang);
    return '';
  }
  if (typeof value === 'number') {
    if (MONEY_KEYS.has(key)) return formatMoney(value, currency, lang);
    // `count` stays numeric so i18next can pick a plural form.
    return key === 'count' ? value : String(Math.round(value * 100) / 100);
  }
  if (typeof value === 'string') {
    if (key === 'time' || key.endsWith('_time')) return formatClock(value, tz, lang);
    if (key === 'date' || key.endsWith('_date')) return formatDay(value, tz, lang);
    if (key === 'month' && /^\d{4}-\d{2}$/.test(value)) {
      return new Date(`${value}-01T00:00:00Z`).toLocaleDateString(localeFor(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    return value;
  }
  return String(value);
}

function templateVars(params: Record<string, unknown>, lang: Lang): Record<string, string | number> {
  const tz = typeof params.tz === 'string' ? params.tz : undefined;
  const currency = typeof params.currency === 'string' && params.currency ? params.currency : 'EGP';
  const vars: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === 'segments' || key === 'tz' || key === 'currency') continue;
    vars[key] = formatParam(key, value, lang, tz, currency);
  }
  return vars;
}

/** Title and body of a notification in `language` (defaults to the app language). */
export function notificationText(row: NotificationTextRow, language: string = i18n.language): NotificationText {
  const lang = toLang(language);
  const key = row.template_key?.trim();

  if (key) {
    const base = `notificationTemplates.${key}`;
    if (!i18n.exists(`${base}.title`, { lng: lang })) {
      // A newer server template this build has no words for yet.
      return { title: i18n.t('notificationTemplates.unknown.title', { lng: lang }), body: '' };
    }
    const params = isRecord(row.template_params) ? row.template_params : {};
    const options = { ...templateVars(params, lang), lng: lang };
    let body = i18n.exists(`${base}.body`, { lng: lang }) ? i18n.t(`${base}.body`, options) : '';
    const segments = Array.isArray(params.segments) ? params.segments : [];
    for (const segment of segments) {
      if (typeof segment === 'string' && i18n.exists(`${base}.segments.${segment}`, { lng: lang })) {
        body += i18n.t(`${base}.segments.${segment}`, options);
      }
    }
    return { title: i18n.t(`${base}.title`, options), body };
  }

  return {
    title: pickLocalized(row.title_ar, row.title_en, lang),
    body: pickLocalized(row.body_ar, row.body_en, lang),
  };
}

export type TemplateNotificationInput = {
  nurseryId: string | null;
  userId: string;
  /** Notification type (filters, icons, routing). */
  type: string;
  /** Locale template under notificationTemplates; defaults to `type`. */
  templateKey?: string;
  params?: Record<string, unknown>;
  actionLink?: string | null;
  urgency?: 'low' | 'normal' | 'high';
  channel?: 'in_app' | 'push';
  imageUrl?: string | null;
};

/** A notifications row that the app renders from its locale files. */
export function templateNotificationRow(input: TemplateNotificationInput) {
  return {
    nursery_id: input.nurseryId,
    user_id: input.userId,
    type: input.type,
    template_key: input.templateKey ?? input.type,
    template_params: input.params ?? {},
    read: false,
    channel: input.channel ?? 'in_app',
    sent_at: new Date().toISOString(),
    action_link: input.actionLink ?? null,
    urgency: input.urgency ?? 'normal',
    image_url: input.imageUrl ?? null,
  };
}

/** Both language versions of a name, for template params. */
export function localizedNames(ar: string | null | undefined, en: string | null | undefined): { ar: string | null; en: string | null } {
  return { ar: ar?.trim() || null, en: en?.trim() || null };
}
