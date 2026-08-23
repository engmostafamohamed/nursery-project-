import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EventsCalendar } from '@/components/events/EventsCalendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useTeacherEventsList, type TeacherEventsListRow } from '@/hooks/useTeacherEventsList';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';

type CategoryFilter = 'all' | 'trip' | 'activity' | 'service' | 'doctor_visit';

const CHIP_BG: Record<string, string> = {
  trip: 'bg-violet-100 text-violet-900',
  activity: 'bg-blue-100 text-blue-900',
  service: 'bg-amber-100 text-amber-900',
  doctor_visit: 'bg-green-100 text-green-900',
};

function categoryChip(cat: string) {
  return CHIP_BG[cat] ?? 'bg-surface-container text-on-surface';
}

// ─── Event detail dialog ─────────────────────────────────────────────────────

function EventDetailDialog({
  event,
  onClose,
  locale,
  t,
}: {
  event: TeacherEventsListRow | null;
  onClose: () => void;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!event) return null;
  const isAr = locale.startsWith('ar');
  const title = isAr ? event.title_ar || event.title_en : event.title_en || event.title_ar;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', hour12: true });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Badge className={`${categoryChip(event.category)} border-transparent text-xs`}>
              {t(`teacher.events.categories.${event.category}`)}
            </Badge>
            {event.is_paid ? (
              <Badge className="border-transparent bg-amber-100 text-amber-900 text-xs">
                {t('teacher.events.paid')}
              </Badge>
            ) : null}
            <Badge
              className={`border-transparent text-xs ${
                event.target_scope === 'class'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {event.target_scope === 'class' ? t('teacher.events.myClassTag') : t('teacher.events.allClassesTag')}
            </Badge>
          </div>
          <DialogTitle className="mt-2 text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs text-on-surface-variant">
            {dateFmt.format(new Date(event.starts_at))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm text-on-surface-variant">
          {event.location ? (
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-base text-primary shrink-0" aria-hidden>location_on</span>
              <p>{event.location}</p>
            </div>
          ) : null}
          {event.permission_deadline ? (
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-base text-primary shrink-0" aria-hidden>timer</span>
              <p>
                {t('teacher.events.permissionDeadline', {
                  date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(
                    new Date(event.permission_deadline),
                  ),
                })}
              </p>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-on-surface-variant">
          {t('teacher.events.readOnlyNote', { defaultValue: 'Permission responses are managed by the nursery admin.' })}
        </p>

        <Button variant="outline" className="w-full" onClick={onClose}>
          {t('common.close', { defaultValue: 'Close' })}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TeacherEventsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  useNurseryLanguagePref(profile?.nursery_id);
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TeacherEventsListRow | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const { data, isPending, isError, classIdsLoading } = useTeacherEventsList({
    userId: user?.id,
    nurseryId: profile?.nursery_id,
  });

  const allEvents = data ?? [];

  const calendarEvents = useMemo(() => {
    if (categoryFilter === 'all') return allEvents;
    return allEvents.filter((e) => e.category === categoryFilter);
  }, [allEvents, categoryFilter]);

  const nowMs = useMemo(() => Date.now(), []);
  const listEvents = useMemo(() => {
    let list = calendarEvents;
    if (selectedDateKey && viewMode === 'calendar') {
      list = list.filter((e) => {
        const d = new Date(e.starts_at);
        const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return dk === selectedDateKey;
      });
    }
    return list;
  }, [calendarEvents, selectedDateKey, viewMode]);

  const upcomingCount = useMemo(
    () => allEvents.filter((e) => new Date(e.starts_at).getTime() > nowMs).length,
    [allEvents, nowMs],
  );

  const CATS: CategoryFilter[] = ['all', 'trip', 'activity', 'service', 'doctor_visit'];

  if (isPending || classIdsLoading) {
    return (
      <div className="space-y-4 pb-8">
        <h1 className="text-lg font-semibold text-on-surface">{t('teacher.events.title')}</h1>
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pb-8">
        <h1 className="text-lg font-semibold text-on-surface">{t('teacher.events.title')}</h1>
        <p className="mt-4 text-sm text-error" role="alert">{t('teacher.events.loadError')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{t('teacher.events.title')}</h1>
          {upcomingCount > 0 ? (
            <p className="text-xs text-on-surface-variant">
              {t('teacher.events.upcomingCount', { count: upcomingCount, defaultValue: `${upcomingCount} upcoming` })}
            </p>
          ) : null}
        </div>
        {/* View toggle */}
        <div className="flex overflow-hidden rounded-lg border border-outline-variant">
          <button
            type="button"
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'calendar'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
            onClick={() => setViewMode('calendar')}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>calendar_month</span>
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'list'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
            onClick={() => { setViewMode('list'); setSelectedDateKey(null); }}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>view_list</span>
          </button>
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === c
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
            onClick={() => setCategoryFilter(c)}
          >
            {t(`teacher.events.categories.${c}`)}
          </button>
        ))}
      </div>

      {allEvents.length === 0 ? (
        <EmptyState
          icon="event_busy"
          title={t('teacher.events.emptyTitle')}
          description={t('teacher.events.emptyDescription')}
        />
      ) : (
        <>
          {/* Calendar view */}
          {viewMode === 'calendar' ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
                <EventsCalendar
                  events={calendarEvents}
                  viewMonth={viewMonth}
                  selectedDateKey={selectedDateKey}
                  locale={locale}
                  onPrevMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  onNextMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  onSelectDate={(key) => { setSelectedDateKey(key); setSelectedEvent(null); }}
                  onEventClick={(ev) => setSelectedEvent(ev)}
                />
              </div>

              {selectedDateKey ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-on-surface">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(
                        new Date(selectedDateKey + 'T00:00:00'),
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedDateKey(null)}
                      className="text-xs text-on-surface-variant hover:underline"
                    >
                      {t('parent.events.clearDateFilter')}
                    </button>
                  </div>
                  {listEvents.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t('teacher.events.emptyFilterDescription')}</p>
                  ) : (
                    listEvents.map((ev) => <EventListRow key={ev.id} event={ev} locale={locale} t={t} onSelect={setSelectedEvent} />)
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* List view */}
          {viewMode === 'list' ? (
            <div className="space-y-3">
              {calendarEvents.length === 0 ? (
                <EmptyState icon="filter_alt_off" title={t('teacher.events.emptyFilterTitle')} description={t('teacher.events.emptyFilterDescription')} />
              ) : (
                calendarEvents.map((ev) => <EventListRow key={ev.id} event={ev} locale={locale} t={t} onSelect={setSelectedEvent} />)
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Event detail dialog */}
      <EventDetailDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} locale={locale} t={t} />
    </div>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────

function EventListRow({
  event,
  locale,
  t,
  onSelect,
}: {
  event: TeacherEventsListRow;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onSelect: (e: TeacherEventsListRow) => void;
}) {
  const isAr = locale.startsWith('ar');
  const title = isAr ? event.title_ar || event.title_en : event.title_en || event.title_ar;
  const isPast = new Date(event.starts_at).getTime() < Date.now();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="flex w-full items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-start transition-colors hover:bg-surface-container"
    >
      <span className={`material-symbols-outlined mt-0.5 shrink-0 text-xl ${isPast ? 'text-on-surface-variant' : 'text-primary'}`} aria-hidden>event</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-on-surface">{title}</p>
        <p className="text-xs text-on-surface-variant">{dateFmt.format(new Date(event.starts_at))}</p>
        <div className="flex flex-wrap gap-1 pt-0.5">
          <Badge className={`${CHIP_BG[event.category] ?? 'bg-surface-container text-on-surface'} border-transparent text-xs`}>
            {t(`teacher.events.categories.${event.category}`)}
          </Badge>
          {isPast ? (
            <Badge className="border-transparent bg-surface-container text-on-surface-variant text-xs">
              {t('teacher.events.past')}
            </Badge>
          ) : (
            <Badge className="border-transparent bg-primary/10 text-primary text-xs">
              {t('teacher.events.upcoming')}
            </Badge>
          )}
        </div>
      </div>
      <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden>chevron_right</span>
    </button>
  );
}
