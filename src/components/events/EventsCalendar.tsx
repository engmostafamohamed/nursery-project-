import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  buildMonthGrid,
  localDateKeyFromIso,
  toLocalDateKey,
  weekdayShortHeaders,
} from '@/lib/parentEventsCalendarUtils';

export type CalendarEvent = {
  id: string;
  title_ar: string;
  title_en: string;
  starts_at: string;
  category: string;
};

type Props<T extends CalendarEvent> = {
  events: T[];
  viewMonth: Date;
  selectedDateKey: string | null;
  locale: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (key: string | null) => void;
  onEventClick: (event: T) => void;
  /** Optional: render a custom badge on days that have events (e.g. permission dot) */
  renderDayExtra?: (dateKey: string, dayEvents: T[]) => React.ReactNode;
};

const DOT_COLOR: Record<string, string> = {
  trip: 'bg-violet-500',
  activity: 'bg-blue-500',
  service: 'bg-amber-500',
  doctor_visit: 'bg-green-500',
};

export function EventsCalendar<T extends CalendarEvent>({
  events,
  viewMonth,
  selectedDateKey,
  locale,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  onEventClick,
  renderDayExtra,
}: Props<T>) {
  const { i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
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
  const todayKey = toLocalDateKey(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const e of events) {
      const k = localDateKeyFromIso(e.starts_at);
      const d = new Date(e.starts_at);
      if (d.getFullYear() === year && d.getMonth() === monthIndex) {
        const list = map.get(k) ?? [];
        list.push(e);
        map.set(k, list);
      }
    }
    return map;
  }, [events, year, monthIndex]);

  return (
    <div className="flex flex-col gap-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          <span
            className="material-symbols-outlined text-base"
            style={{ transform: isAr ? 'rotate(180deg)' : undefined }}
            aria-hidden
          >
            chevron_left
          </span>
        </Button>
        <p className="text-sm font-semibold text-on-surface">{monthTitle}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          <span
            className="material-symbols-outlined text-base"
            style={{ transform: isAr ? 'rotate(180deg)' : undefined }}
            aria-hidden
          >
            chevron_right
          </span>
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 text-center text-xs font-medium text-on-surface-variant">
        {headers.map((h) => (
          <div key={h} className="py-1">{h}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell, idx) => {
          if (!cell) {
            return (
              <div
                key={`pad-${idx}`}
                className="min-h-[5rem] rounded-xl bg-surface-container/30"
              />
            );
          }
          const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
          const dayEvents = byDay.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;
          const isSelected = selectedDateKey === dateKey;
          const MAX_CHIPS = 3;

          return (
            <div
              key={dateKey}
              className={`flex min-h-[5rem] flex-col rounded-xl border p-1 transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : isToday
                    ? 'border-primary/50 bg-primary-fixed/20'
                    : 'border-outline-variant/50 bg-surface-container-lowest hover:bg-surface-container'
              }`}
            >
              {/* Day number */}
              <button
                type="button"
                onClick={() => onSelectDate(isSelected ? null : dateKey)}
                className="self-start"
                aria-label={`${cell.day}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {cell.day}
                </span>
              </button>

              {/* Event entries */}
              <div className="mt-0.5 flex flex-col gap-0.5">
                {dayEvents.slice(0, MAX_CHIPS).map((ev) => {
                  const title = isAr ? ev.title_ar || ev.title_en : ev.title_en || ev.title_ar;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      className="flex w-full items-center gap-1 rounded px-0.5 py-0.5 text-start hover:bg-surface-container"
                      title={title}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLOR[ev.category] ?? 'bg-on-surface-variant'}`}
                        aria-hidden
                      />
                      <span className="truncate text-[10px] leading-tight text-on-surface">{title}</span>
                    </button>
                  );
                })}
                {dayEvents.length > MAX_CHIPS ? (
                  <button
                    type="button"
                    onClick={() => onSelectDate(dateKey)}
                    className="text-start text-[10px] text-on-surface-variant hover:underline"
                  >
                    +{dayEvents.length - MAX_CHIPS} more
                  </button>
                ) : null}
              </div>

              {renderDayExtra ? renderDayExtra(dateKey, dayEvents) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
