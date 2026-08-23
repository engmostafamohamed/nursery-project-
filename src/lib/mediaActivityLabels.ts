import type { TFunction } from 'i18next';

/** Map legacy `activity_type` values to current i18n keys. */
const LEGACY_ACTIVITY_KEYS: Record<string, string> = {
  outdoor: 'outdoor_play',
};

export function mediaActivityLabel(t: TFunction, activityType: string | null): string {
  if (!activityType) return '—';
  if (!/^[a-z0-9_]+$/i.test(activityType)) return activityType;
  const key = LEGACY_ACTIVITY_KEYS[activityType] ?? activityType;
  const i18nKey = `media.activity.${key}`;
  const out = t(i18nKey);
  return out === i18nKey ? activityType : out;
}
