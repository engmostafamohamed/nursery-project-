import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { formatDay } from '@/lib/datetime';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';

import { nextDayOff } from './daysOff';
import { HolidaysCard } from './HolidaysCard';
import { useHolidays, useOpenWeekdays } from './useDaysOff';
import { WeeklyDaysOffCard } from './WeeklyDaysOffCard';

/**
 * The settings page's days off: the manager sets the weekly days off and the holidays; the system
 * applies them everywhere (attendance, staff tasks, the menu, the families' screens) and tells the
 * families and staff before each day off.
 */
export function DaysOffSettings({ nurseryId }: { nurseryId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const [today] = useState(() => getNurseryCalendarDateString());
  const year = Number(today.slice(0, 4));
  const week = useOpenWeekdays(nurseryId);
  const thisYear = useHolidays(nurseryId, year);
  const nextYear = useHolidays(nurseryId, year + 1);
  const next = week.data && thisYear.data && nextYear.data ? nextDayOff(today, week.data, [...thisYear.data, ...nextYear.data]) : null;

  return (
    <div className="space-y-4" data-testid="days-off-settings">
      <section className="flex flex-wrap items-start gap-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MaterialSymbol name="event_available" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-base font-semibold text-on-surface">{t('daysOff.title')}</h2>
          <p className="text-sm text-on-surface-variant">{t('daysOff.hint')}</p>
          {next ? (
            <p className="text-sm font-medium text-on-surface" data-testid="next-day-off">
              {t(next.day === today ? 'daysOff.nextToday' : 'daysOff.next', {
                day: formatDay(next.day, { weekday: 'long', day: 'numeric', month: 'long' }),
                why: next.holiday ? localName(next.holiday.name_ar, next.holiday.name_en, isAr) : t('daysOff.weeklyOff'),
              })}
            </p>
          ) : null}
        </div>
      </section>
      <WeeklyDaysOffCard nurseryId={nurseryId} />
      <HolidaysCard nurseryId={nurseryId} today={today} />
    </div>
  );
}
