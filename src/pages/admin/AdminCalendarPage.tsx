import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useAdminCalendarEvents } from '@/hooks/useAdminCalendarEvents';
import { useUserProfile } from '@/hooks/useUserProfile';

const DAY_NAMES_SUN_FIRST = [0, 1, 2, 3, 4, 5, 6];

type UiType = 'general' | 'trip' | 'health' | 'celebration' | 'meeting';

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function buildCalendarCells(monthDate: Date) {
  const first = startOfMonth(monthDate);
  const dayOffset = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - dayOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isoDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
}

function inferUiType(category: string, titleAr: string, titleEn: string): UiType {
  if (category === 'trip') return 'trip';
  if (category === 'doctor_visit') return 'health';
  if (category === 'activity') return 'general';
  const hay = `${titleAr} ${titleEn}`.toLowerCase();
  if (hay.includes('احتفال') || hay.includes('celebr')) return 'celebration';
  return 'meeting';
}

const DOT_CLASS: Record<UiType, string> = {
  general: 'bg-primary',
  trip: 'bg-success',
  health: 'bg-error',
  celebration: 'bg-accent',
  meeting: 'bg-info',
};

export function AdminCalendarPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = addMonths(monthStart, 1);
  const eventsQuery = useAdminCalendarEvents({
    nurseryId: profile?.nursery_id,
    monthStartIso: monthStart.toISOString(),
    monthEndIso: monthEnd.toISOString(),
  });
  const events = eventsQuery.data ?? [];

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const event of events) {
      const key = isoDate(new Date(event.starts_at));
      const prev = map.get(key) ?? [];
      map.set(key, [...prev, event]);
    }
    return map;
  }, [events]);

  const dayEvents = selectedDay ? eventsByDate.get(isoDate(selectedDay)) ?? [] : [];
  const cells = buildCalendarCells(currentMonth);
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(currentMonth);
  const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-on-surface">{t('admin.calendarView.title')}</h1>
        <Button variant="outline" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>
          {t('admin.calendarView.today')}
        </Button>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm font-semibold text-on-surface">{monthLabel}</p>
          <div className="flex gap-2">
            <select
              className="h-9 rounded-lg border border-outline-variant bg-surface text-foreground px-2 text-xs"
              value={currentMonth.getMonth()}
              onChange={(e) => setCurrentMonth(new Date(currentMonth.getFullYear(), Number(e.target.value), 1))}
            >
              {Array.from({ length: 12 }, (_, m) => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2026, m, 1))}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-lg border border-outline-variant bg-surface text-foreground px-2 text-xs"
              value={currentMonth.getFullYear()}
              onChange={(e) => setCurrentMonth(new Date(Number(e.target.value), currentMonth.getMonth(), 1))}
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-on-surface-variant">
          {DAY_NAMES_SUN_FIRST.map((d) => (
            <div key={d}>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 4 + d))}</div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day) => {
            const key = isoDate(day);
            const inMonth = day.getMonth() === currentMonth.getMonth();
            const daily = eventsByDate.get(key) ?? [];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`min-h-20 rounded-lg border p-1 text-start ${inMonth ? 'bg-surface' : 'bg-surface-container'} border-outline-variant`}
              >
                <p className={`text-xs ${inMonth ? 'text-on-surface' : 'text-on-surface-variant'}`}>{day.getDate()}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {daily.slice(0, 4).map((event) => {
                    const type = inferUiType(event.category, event.title_ar, event.title_en);
                    return <span key={event.id} className={`h-2 w-2 rounded-full ${DOT_CLASS[type]}`} />;
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!events.length ? (
        <EmptyState
          icon="event_busy"
          title={t('admin.calendarView.emptyTitle')}
          description={t('admin.calendarView.emptyDescription')}
        />
      ) : null}

      <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(selectedDay) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {dayEvents.length ? dayEvents.map((event) => {
              const type = inferUiType(event.category, event.title_ar, event.title_en);
              const name = i18n.language === 'ar' ? event.title_ar : event.title_en;
              return (
                <Link
                  key={event.id}
                  className="block rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
                  to={`/admin/events/${event.id}${isPreview ? '?preview=true' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[type]}`} />
                    <p className="text-sm font-semibold text-on-surface">{name}</p>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {new Date(event.starts_at).toLocaleString(locale)}
                  </p>
                </Link>
              );
            }) : (
              <p className="text-sm text-on-surface-variant">{t('admin.calendarView.noEventsOnDay')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
