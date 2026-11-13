import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { localName } from '@/lib/bilingualName';
import {
  buildMonthGrid,
  categoryDotClass,
  categoryTone,
  eventsInMonth,
  localDateKeyFromIso,
  toLocalDateKey,
  weekdayShortHeaders,
} from '@/lib/parentEventsCalendarUtils';
import { cn } from '@/lib/utils';

export type CalendarEvent = {
  id: string;
  title_ar: string;
  title_en: string;
  starts_at: string;
  category: string;
  is_urgent?: boolean | null;
};

const LEGEND = ['trip', 'activity', 'service', 'doctor_visit'] as const;
const CHIPS_PER_DAY = 2;

/**
 * A month of events for the admin, the teachers and the families: each day shows its events in
 * their category's colour (dots on phones), and picking a day lists that day's events under it.
 */
export function EventsCalendar<T extends CalendarEvent>({
  events,
  viewMonth,
  selectedDateKey,
  locale,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onToday,
}: {
  events: T[];
  viewMonth: Date;
  selectedDateKey: string | null;
  locale: string;
  onSelectDate: (key: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Jumps back to this month (and clears the day). */
  onToday?: () => void;
}) {
  const { t } = useTranslation();
  const isAr = locale.startsWith('ar');
  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();

  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex, 1)),
    [locale, year, monthIndex],
  );
  const headers = useMemo(() => weekdayShortHeaders(locale), [locale]);
  const dayName = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }), [locale]);
  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);
  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const e of eventsInMonth(events, year, monthIndex)) {
      const key = localDateKeyFromIso(e.starts_at);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events, year, monthIndex]);

  const todayKey = toLocalDateKey(new Date());
  // The grid always has six weeks; drop the trailing ones with no day of this month.
  const lastDayCell = grid.findLastIndex((cell) => cell !== null);
  const cells = grid.slice(0, (Math.floor(lastDayCell / 7) + 1) * 7);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-on-surface">{monthTitle}</h3>
        <div className="flex items-center gap-1">
          {onToday ? (
            <Button type="button" variant="outline" size="sm" onClick={onToday}>
              {t('common.today')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onPrevMonth} aria-label={t('eventsCalendar.prev')}>
            <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>chevron_left</span>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onNextMonth} aria-label={t('eventsCalendar.next')}>
            <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>chevron_right</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-on-surface-variant">
        {headers.map((h) => (
          <div key={h} className="py-1">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`e-${idx}`} className="min-h-[3.25rem] rounded-md sm:min-h-[5.5rem]" aria-hidden />;
          const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
          const dayEvents = byDay.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;
          const isSelected = selectedDateKey === dateKey;
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : dateKey)}
              aria-pressed={isSelected}
              aria-label={t('eventsCalendar.selectDay', { date: dayName.format(new Date(year, monthIndex, cell.day)), count: dayEvents.length })}
              className={cn(
                'flex min-h-[3.25rem] min-w-0 flex-col items-center gap-1 rounded-md border p-1 text-start transition-colors sm:min-h-[5.5rem] sm:items-stretch sm:p-1.5',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : dayEvents.length
                    ? 'border-outline-variant bg-surface hover:border-primary/50'
                    : 'border-transparent bg-surface-container-lowest hover:border-outline-variant',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm tabular-nums',
                  isToday ? 'bg-primary font-bold text-primary-foreground' : 'font-medium text-on-surface',
                )}
              >
                {cell.day}
              </span>
              {/* Phones: one dot per event. */}
              <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                {dayEvents.slice(0, 3).map((e) => (
                  <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', categoryDotClass(e.category))} />
                ))}
              </span>
              {/* Wider screens: the event titles. */}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {dayEvents.slice(0, CHIPS_PER_DAY).map((e) => {
                  const title = localName(e.title_ar, e.title_en, isAr);
                  return (
                    <span key={e.id} className={cn('truncate rounded px-1.5 py-0.5 text-[11px] font-medium', TONE_TINT[categoryTone(e.category)])} title={title}>
                      {e.is_urgent ? '! ' : ''}
                      {title}
                    </span>
                  );
                })}
                {dayEvents.length > CHIPS_PER_DAY ? (
                  <span className="px-1.5 text-[11px] font-medium text-on-surface-variant">
                    {t('eventsCalendar.moreOnDay', { count: dayEvents.length - CHIPS_PER_DAY })}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant" aria-label={t('eventsCalendar.legend')}>
        {LEGEND.map((category) => (
          <li key={category} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', categoryDotClass(category))} aria-hidden />
            {t(`admin.events.create.categories.${category}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
