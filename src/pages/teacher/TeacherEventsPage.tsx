import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EventsCalendar } from '@/components/events/EventsCalendar';
import { EventsViewToggle, type EventsView } from '@/components/events/EventsViewToggle';
import { SelectedDayChip } from '@/components/events/SelectedDayChip';
import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TablePagination } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { EventRosterDialog } from '@/features/events/EventRosterDialog';
import { EVENT_CATEGORIES } from '@/features/events/events';
import { TeacherEventCard } from '@/features/events/TeacherEventCard';
import { filterTeacherEvents, TEACHER_EVENT_TABS, teacherEventsOverview, whenOf, type TeacherEventTab } from '@/features/events/teacherEvents';
import { useTeacherEvents } from '@/features/events/useTeacherEvents';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { usePagination } from '@/hooks/usePagination';
import { useSearchParam } from '@/hooks/useSearchParam';
import { useUserProfile } from '@/hooks/useUserProfile';

const CATEGORY_FILTERS = ['all', ...EVENT_CATEGORIES] as const;
type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

/**
 * The events of the teacher's classes: today's first (the check-in day), the ones to come and the
 * done ones, in a list or on the calendar. Each opens who of the teacher's children is going and
 * who was checked in; a reminder's link (?event=<id>) opens it directly.
 */
export function TeacherEventsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  useNurseryLanguagePref(profile?.nursery_id);
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const eventsQuery = useTeacherEvents(user?.id);

  const [view, setView] = useState<EventsView>('list');
  const [tab, setTab] = useState<TeacherEventTab>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [openId, setOpenId] = useSearchParam('event');
  const [now] = useState(() => new Date());

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const overview = useMemo(() => teacherEventsOverview(events, now), [events, now]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: events.length };
    for (const e of events) counts[e.category] = (counts[e.category] ?? 0) + 1;
    return counts;
  }, [events]);
  const pickedDay = view === 'calendar' ? dayKey : null;
  const shown = useMemo(() => filterTeacherEvents(events, { tab, category, dayKey: pickedDay }, now), [events, tab, category, pickedDay, now]);
  const pager = usePagination(shown, 6, `${tab}|${category}|${pickedDay}|${view}`);
  const openEvent = openId ? events.find((e) => e.id === openId) ?? null : null;

  const filtersActive = tab !== 'all' || category !== 'all' || Boolean(pickedDay);
  const clearFilters = () => {
    setTab('all');
    setCategory('all');
    setDayKey(null);
  };
  const toggleTab = (next: TeacherEventTab) => setTab((current) => (current === next ? 'all' : next));

  const header = (
    <PageHeader icon="event" title={t('teacher.events.title')} description={t('teacher.events.subtitle')}>
      {eventsQuery.isSuccess ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon="today"
            label={t('teacher.events.tabs.today')}
            value={overview.counts.today}
            tone={overview.counts.today > 0 ? 'primary' : 'neutral'}
            onClick={() => toggleTab('today')}
            active={tab === 'today'}
          />
          <StatTile icon="groups" label={t('teacher.events.goingToday')} value={overview.goingToday} tone={overview.goingToday > 0 ? 'success' : 'neutral'} />
          <StatTile icon="upcoming" label={t('teacher.events.tabs.upcoming')} value={overview.counts.upcoming} onClick={() => toggleTab('upcoming')} active={tab === 'upcoming'} />
          <StatTile icon="history" label={t('teacher.events.tabs.past')} value={overview.counts.past} onClick={() => toggleTab('past')} active={tab === 'past'} />
        </div>
      ) : null}
    </PageHeader>
  );

  if (eventsQuery.isPending) {
    return (
      <div className="space-y-5 pb-8">
        {header}
        <LoadingSkeleton variant="eventCards" eventCardsLabel={t('teacher.events.title')} />
      </div>
    );
  }

  if (eventsQuery.isError) {
    return (
      <div className="space-y-5 pb-8">
        {header}
        <LoadError message={t('teacher.events.loadError')} onRetry={() => void eventsQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {header}

      <TableCard
        title={t('teacher.events.title')}
        count={t('eventForm.eventsCount', { count: shown.length })}
        actions={<EventsViewToggle value={view} onChange={setView} />}
        filters={
          events.length === 0 ? null : (
            <div className="space-y-3">
              <FilterChips
                label={t('teacher.events.whenLabel')}
                value={tab}
                onChange={setTab}
                options={TEACHER_EVENT_TABS.map((key) => ({ value: key, label: t(`teacher.events.tabs.${key}`), count: overview.counts[key] }))}
              />
              <FilterChips
                label={t('teacher.events.categoryLabel')}
                value={category}
                onChange={setCategory}
                hideEmpty
                options={CATEGORY_FILTERS.map((key) => ({ value: key, label: t(`admin.events.list.categoryOption.${key}`), count: categoryCounts[key] ?? 0 }))}
              />
              {pickedDay ? <SelectedDayChip dateKey={pickedDay} locale={locale} onClear={() => setDayKey(null)} /> : null}
            </div>
          )
        }
        pagination={shown.length === 0 ? null : <TablePagination pager={pager} pageSizeOptions={[6, 12, 24]} />}
      >
        {view === 'calendar' ? (
          <div className="border-b border-outline-variant p-4 sm:p-5">
            <EventsCalendar
              viewMonth={viewMonth}
              events={events}
              selectedDateKey={dayKey}
              onSelectDate={setDayKey}
              onPrevMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              onNextMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              onToday={() => {
                const n = new Date();
                setViewMonth(new Date(n.getFullYear(), n.getMonth(), 1));
                setDayKey(null);
              }}
              locale={locale}
            />
          </div>
        ) : null}

        {events.length === 0 ? (
          <TableEmpty icon="event_busy" title={t('teacher.events.emptyTitle')} description={t('teacher.events.emptyDescription')} />
        ) : shown.length === 0 ? (
          <TableEmpty
            icon="filter_alt_off"
            title={t('teacher.events.emptyFilterTitle')}
            description={t('teacher.events.emptyFilterDescription')}
            action={
              filtersActive ? (
                <Button type="button" variant="outline" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
            {pager.pageItems.map((event) => (
              <TeacherEventCard key={event.id} event={event} when={whenOf(event, now)} locale={locale} onOpen={() => setOpenId(event.id)} />
            ))}
          </div>
        )}
      </TableCard>

      {openEvent ? (
        <EventRosterDialog event={openEvent} isToday={whenOf(openEvent, now) === 'today'} locale={locale} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}
