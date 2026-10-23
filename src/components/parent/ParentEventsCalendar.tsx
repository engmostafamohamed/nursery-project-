import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { ParentCatalogEventRow } from '@/hooks/useParentEventsCatalog';
import {
  buildMonthGrid,
  categoryDotClass,
  categoryTone,
  eventsInMonth,
  localDateKeyFromIso,
  toLocalDateKey,
  weekdayShortHeaders,
  type EventCategoryTone,
} from '@/lib/parentEventsCalendarUtils';
import { cn } from '@/lib/utils';

type Props = {
  viewMonth: Date;
  allEvents: ParentCatalogEventRow[];
  selectedDateKey: string | null;
  onSelectDate: (key: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Jumps back to the current month (and clears the selected day). */
  onToday?: () => void;
  locale: string;
};

const CHIP_CLASS: Record<EventCategoryTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  neutral: 'bg-surface-high text-on-surface-variant',
};

const LEGEND = ['trip', 'activity', 'service', 'doctor_visit'] as const;

export function ParentEventsCalendar({
  viewMonth,
  allEvents,
  selectedDateKey,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  locale,
}: Props) {
  const { t } = useTranslation();
  const isAr = locale.startsWith('ar');
  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(year, monthIndex, 1),
      ),
    [locale, year, monthIndex],
  );

  const headers = useMemo(() => weekdayShortHeaders(locale), [locale]);
  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);
  const inMonth = useMemo(() => eventsInMonth(allEvents, year, monthIndex), [allEvents, year, monthIndex]);

  const byDay = useMemo(() => {
    const m = new Map<string, ParentCatalogEventRow[]>();
    for (const e of inMonth) {
      const k = localDateKeyFromIso(e.starts_at);
      const list = m.get(k) ?? [];
      list.push(e);
      m.set(k, list);
    }
    return m;
  }, [inMonth]);

  const todayKey = toLocalDateKey(new Date());
  // The grid always has six weeks; drop the trailing ones with no day of this month.
  const lastDayCell = grid.findLastIndex((cell) => cell !== null);
  const cells = grid.slice(0, (Math.floor(lastDayCell / 7) + 1) * 7);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-on-surface">{t('parent.events.monthTitle', { monthYear: monthTitle })}</h3>
        <div className="flex items-center gap-1">
          {onToday ? (
            <Button type="button" variant="outline" size="sm" onClick={onToday}>
              {t('common.today')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onPrevMonth} aria-label={t('parent.events.calendarPrev')}>
            <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>chevron_left</span>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onNextMonth} aria-label={t('parent.events.calendarNext')}>
            <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>chevron_right</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-on-surface-variant">
        {headers.map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`e-${idx}`} className="min-h-[3.25rem] rounded-md sm:min-h-[5.5rem]" aria-hidden />;
          }
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
              className={cn(
                'flex min-h-[3.25rem] min-w-0 flex-col items-center gap-1 rounded-md border p-1 text-start transition-colors sm:min-h-[5.5rem] sm:items-stretch sm:p-1.5',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : dayEvents.length
                    ? 'border-outline-variant bg-surface hover:border-primary/50'
                    : 'border-transparent bg-surface-container-lowest hover:border-outline-variant',
              )}
              aria-label={t('parent.events.selectDay', { date: String(cell.day) })}
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
                {dayEvents.slice(0, 2).map((e) => (
                  <span
                    key={e.id}
                    className={cn('truncate rounded px-1.5 py-0.5 text-[11px] font-medium', CHIP_CLASS[categoryTone(e.category)])}
                    title={(isAr ? e.title_ar : e.title_en) || e.title_en || e.title_ar}
                  >
                    {e.is_urgent ? '! ' : ''}
                    {(isAr ? e.title_ar : e.title_en) || e.title_en || e.title_ar}
                  </span>
                ))}
                {dayEvents.length > 2 ? (
                  <span className="px-1.5 text-[11px] font-medium text-on-surface-variant">
                    {t('parent.events.moreOnDay', { count: dayEvents.length - 2 })}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
        {LEGEND.map((category) => (
          <li key={category} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', categoryDotClass(category))} aria-hidden />
            {t(`parent.events.categories.${category}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
