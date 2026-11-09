/*
 * Names kept in Arabic and English, shown the way the nursery chose (its language setting): only
 * Arabic, only English, or both. With both, the reader's language comes first and the other name
 * sits under it; identical names appear once.
 */

export type LanguagePref = 'ar' | 'en' | 'both';
export type NameLines = { primary: string; secondary: string };

const DASH = '—';

/** For display: the main line, and the other language's name under it when the nursery shows both. */
export function nameLines(ar: string | null | undefined, en: string | null | undefined, pref: LanguagePref, arabicFirst: boolean): NameLines {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return { primary: a || e || DASH, secondary: '' };
  if (pref === 'en') return { primary: e || a || DASH, secondary: '' };
  if (!a || !e || a === e) return { primary: a || e || DASH, secondary: '' };
  return arabicFirst ? { primary: a, secondary: e } : { primary: e, secondary: a };
}

/** One line, for sorting, searching and titles: "عربي / English" when the nursery shows both. */
export function nameText(ar: string | null | undefined, en: string | null | undefined, pref: LanguagePref): string {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return a || e || DASH;
  if (pref === 'en') return e || a || DASH;
  if (a && e && a !== e) return `${a} / ${e}`;
  return a || e || DASH;
}
