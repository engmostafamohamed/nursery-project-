import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { ParentCatalogEventRow } from '@/hooks/useParentEventsCatalog';
import {
  buildMonthGrid,
  categoryDotClass,
  eventsInMonth,
  localDateKeyFromIso,
  toLocalDateKey,
  weekdayShortHeaders,
} from '@/lib/parentEventsCalendarUtils';

type Props = {
  viewMonth: Date;
  allEvents: ParentCatalogEventRow[];
  selectedDateKey: string | null;
  onSelectDate: (key: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  locale: string;
};

export function ParentEventsCalendar({
  viewMonth,
  allEvents,
  selectedDateKey,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  locale,
}: Props) {
  const { t } = useTranslation();
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

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[320px] flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onPrevMonth} aria-label={t('parent.events.calendarPrev')}>
            <span className="material-symbols-outlined text-base rtl:rotate-180" aria-hidden>
              chevron_left
            </span>
          </Button>
          <p className="text-sm font-semibold text-on-surface">{t('parent.events.monthTitle', { monthYear: monthTitle })}</p>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onNextMonth} aria-label={t('parent.events.calendarNext')}>
            <span className="material-symbols-outlined text-base rtl:rotate-180" aria-hidden>
              chevron_right
            </span>
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-on-surface-variant">
          {headers.map((h) => (
            <div key={h} className="py-1">
              {h}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell, idx) => {
            if (!cell) {
              return <div key={`e-${idx}`} className="min-h-[3rem] rounded-lg bg-surface-container/40" />;
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
                className={`flex min-h-[3rem] flex-col items-center rounded-lg border p-1 text-sm transition-colors ${
                  isSelected
                    ? 'border-secondary bg-secondary/10 text-on-surface'
                    : isToday
                      ? 'border-secondary bg-primary-fixed/30 font-semibold text-on-surface'
                      : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface hover:bg-surface-container'
                }`}
                aria-label={t('parent.events.selectDay', { date: String(cell.day) })}
              >
                <span>{cell.day}</span>
                <span className="mt-1 flex min-h-[0.5rem] flex-wrap justify-center gap-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={`h-1.5 w-1.5 rounded-full ${categoryDotClass(e.category)}`}
                      title={(e.title_en || e.title_ar).slice(0, 40)}
                    />
                  ))}
                  {dayEvents.length > 3 ? (
                    <span className="text-[10px] text-on-surface-variant">+{dayEvents.length - 3}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
