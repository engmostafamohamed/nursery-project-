import type { TFunction } from 'i18next';

import { parseMealAmount, parseMood, parseNapQuality, type Mood } from './dailyReport';
import { mealAmountName, moodName, napQualityName } from './dailyReportLabels';

// The words for a stored daily report answer, for screens that read the raw JSON. The mapping of
// old and new words is dailyReport.ts's, and the words are dailyReportLabels.ts's, so every screen
// reads a report the same way.

/** A meal slot ({ amount } or the older { appetite }); no answer reads as half the plate. */
export function formatMealSlot(t: TFunction, slot: Record<string, unknown> | undefined): string {
  return mealAmountName(t, parseMealAmount(slot?.amount ?? slot?.appetite) ?? 'half');
}

export function formatNapQuality(t: TFunction, raw: unknown): string {
  return napQualityName(t, parseNapQuality(raw) ?? 'ok');
}

/** The mood a report's raw value maps to (unknown values read as happy). */
export function moodKey(raw: unknown): Mood {
  return parseMood(raw) ?? 'happy';
}

export function formatMoodLabel(t: TFunction, raw: unknown): string {
  return moodName(t, moodKey(raw));
}

export function formatActivityTag(t: TFunction, tag: string): string {
  const k = tag.replace(/[^a-z_]/gi, '');
  return t(`reports.daily.options.activities.${k}`, { defaultValue: tag });
}
