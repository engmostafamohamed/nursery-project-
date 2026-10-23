import type { TFunction } from 'i18next';

function mealKeyFromRaw(raw: unknown): string {
  const o = raw as Record<string, unknown> | undefined;
  const v = o?.amount ?? o?.appetite ?? raw;
  const s = String(v ?? '');
  if (s === 'none' || s === 'some' || s === 'all') return s;
  if (s === 'ate_all') return 'all';
  if (s === 'did_not_eat') return 'none';
  return 'some';
}

export function formatMealSlot(t: TFunction, slot: Record<string, unknown> | undefined): string {
  const k = mealKeyFromRaw(slot);
  return t(`reports.daily.options.mealAmount.${k}`);
}

const NAP_QUALITY_MAP: Record<string, 'good' | 'ok' | 'restless'> = {
  good: 'good',
  ok: 'ok',
  restless: 'restless',
  slept_well: 'good',
  did_not_sleep: 'ok',
};

export function formatNapQuality(t: TFunction, raw: unknown): string {
  const s = String(raw ?? '');
  const k = NAP_QUALITY_MAP[s] ?? 'ok';
  return t(`reports.daily.options.napQuality.${k}`);
}

const MOOD_MAP: Record<string, 'happy' | 'content' | 'fussy' | 'cranky'> = {
  happy: 'happy',
  content: 'content',
  fussy: 'fussy',
  cranky: 'cranky',
  neutral: 'content',
  sad: 'fussy',
  tired: 'content',
  upset: 'cranky',
};

/** The mood a report's raw value maps to (unknown values read as happy, as in formatMoodLabel). */
export function moodKey(raw: unknown): 'happy' | 'content' | 'fussy' | 'cranky' {
  return MOOD_MAP[String(raw ?? '')] ?? 'happy';
}

export function formatMoodLabel(t: TFunction, raw: unknown): string {
  return t(`reports.daily.options.mood.${moodKey(raw)}`);
}

export function formatActivityTag(t: TFunction, tag: string): string {
  const k = tag.replace(/[^a-z_]/gi, '');
  return t(`reports.daily.options.activities.${k}`, { defaultValue: tag });
}
