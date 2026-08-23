import type { TFunction } from 'i18next';

export const URGENT_EVENT_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const URGENT_EVENT_HOURS = Array.from({ length: 24 }, (_, h) => h);

export type UrgentEventSchedule = {
  urgent_days_of_week?: number[] | null;
  urgent_hours_of_day?: number[] | null;
  urgent_repeats_weekly?: boolean | null;
};

export const formatUrgentHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function sortUniqueNumbers(values: number[] | null | undefined) {
  return [...new Set(values ?? [])].sort((a, b) => a - b);
}

export function summarizeUrgentSchedule(
  event: UrgentEventSchedule,
  t: TFunction,
): string | null {
  const days = sortUniqueNumbers(event.urgent_days_of_week);
  const hours = sortUniqueNumbers(event.urgent_hours_of_day);
  if (!days.length || !hours.length) return null;

  const dayText = days
    .map((d) => t(`reminders.daysShort.${URGENT_EVENT_DAY_KEYS[d]}`))
    .join(', ');
  const hourText = hours.map(formatUrgentHour).join(', ');
  const repeatText = event.urgent_repeats_weekly
    ? t('admin.events.urgentSchedule.repeatsWeekly')
    : t('admin.events.urgentSchedule.oneTime');

  return t('admin.events.urgentSchedule.summary', {
    days: dayText,
    hours: hourText,
    repeat: repeatText,
  });
}
