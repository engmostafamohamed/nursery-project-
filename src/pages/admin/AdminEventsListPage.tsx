import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { EventsCalendar } from '@/components/events/EventsCalendar';
import { EventsViewToggle, type EventsView } from '@/components/events/EventsViewToggle';
import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TablePagination } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { AdminEventCard } from '@/features/events/AdminEventCard';
import { NO_EVENT_FILTERS, type AdminEventsFilterState } from '@/features/events/adminEventFilters';
import { AdminEventsFilters } from '@/features/events/AdminEventsFilters';
import { countBy, eventsOverview, upcomingFirst, type EventStage } from '@/features/events/events';
import { useEventActions } from '@/features/events/useEventActions';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminEventPermissionStats } from '@/hooks/useAdminEventPermissionStats';
import { inferEventListStatus, useAdminEventsList, type AdminEventsListRow } from '@/hooks/useAdminEventsList';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePagination } from '@/hooks/usePagination';
import { useCanAction } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localName } from '@/lib/bilingualName';
import { localDateKeyFromIso } from '@/lib/parentEventsCalendarUtils';

const stageOf = (row: AdminEventsListRow) => inferEventListStatus(row) as EventStage;

/** The month to open on: ?month=YYYY-MM (after creating an event), else this month. */
function initialMonth(param: string | null): Date {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function AdminEventsListPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user } = useAuthSession();
  const profileQuery = useUserProfile(user?.id);
  const { activeNurseryId: nurseryId, isLoading: nurseryLoading } = useActiveNurseryId();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const can = {
    create: useCanAction('event_calendar', 'create'),
    update: useCanAction('event_calendar', 'update'),
    delete: useCanAction('event_calendar', 'delete'),
  };

  const [view, setView] = useState<EventsView>('calendar');
  const [filters, setFilters] = useState<AdminEventsFilterState>(NO_EVENT_FILTERS);
  const [viewMonth, setViewMonth] = useState(() => initialMonth(searchParams.get('month')));
  const search = useDebouncedValue(filters.search, 300);
  const [now] = useState(() => new Date());

  const eventsQuery = useAdminEventsList({ nurseryId, statusFilter: filters.status, categoryFilter: filters.category, dateFilter: filters.date });
  const rows = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const statsQuery = useAdminEventPermissionStats(ids);
  const stats = useMemo(() => statsQuery.data ?? {}, [statsQuery.data]);
  const actions = useEventActions(nurseryId, { qs });
  const titleOf = (row: AdminEventsListRow) => localName(row.title_ar, row.title_en, isAr);

  const overview = useMemo(() => eventsOverview(rows, stageOf, (r) => stats[r.id]?.pending ?? 0, now), [rows, stats, now]);
  const statusCounts = useMemo(
    () => ({ ...countBy(rows, stageOf), all: rows.length, urgent: rows.filter((r) => r.is_urgent).length }),
    [rows],
  );
  const categoryCounts = useMemo(() => ({ ...countBy(rows, (r) => r.category), all: rows.length }), [rows]);

  // Filtered by stage, kind and date in the hook; by the search and the picked day here.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    const found = q ? eventsQuery.filtered.filter((e) => `${e.title_ar} ${e.title_en}`.toLowerCase().includes(q)) : eventsQuery.filtered;
    return upcomingFirst(found, now);
  }, [eventsQuery.filtered, search, now]);
  const shown = useMemo(
    () => (view === 'calendar' && filters.day ? matching.filter((e) => localDateKeyFromIso(e.starts_at) === filters.day) : matching),
    [matching, view, filters.day],
  );
  const pager = usePagination(shown, 6, `${filters.status}|${filters.category}|${filters.date}|${search}|${filters.day}|${view}`);

  const toggleStatus = (status: AdminEventsFilterState['status'], date: AdminEventsFilterState['date'] = 'all') =>
    setFilters((f) => (f.status === status && f.date === date ? { ...f, status: 'all', date: 'all' } : { ...f, status, date }));
  const goToToday = () => {
    setViewMonth(initialMonth(null));
    setFilters((f) => ({ ...f, day: null }));
  };

  const newEventButton = can.create ? (
    <Button asChild>
      <Link to={`/admin/events/create${qs}`}>
        <MaterialSymbol name="add" size="text-base" className="me-1" />
        {t('admin.events.new')}
      </Link>
    </Button>
  ) : null;

  const header = (
    <PageHeader icon="event" title={t('admin.events.title')} description={t('eventForm.listDescription')} actions={newEventButton}>
      {rows.length ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon="event_upcoming"
            label={t('eventForm.overview.upcoming')}
            value={overview.upcoming}
            onClick={() => toggleStatus('active', 'upcoming')}
            active={filters.status === 'active' && filters.date === 'upcoming'}
          />
          <StatTile
            icon="draft"
            label={t('eventForm.overview.drafts')}
            value={overview.drafts}
            tone={overview.drafts ? 'warning' : 'neutral'}
            helper={overview.drafts ? t('eventForm.overview.draftsHelper') : undefined}
            onClick={() => toggleStatus('draft')}
            active={filters.status === 'draft' && filters.date === 'all'}
          />
          <StatTile
            icon="pending_actions"
            label={t('eventForm.overview.awaitingReplies')}
            value={overview.awaitingReplies}
            tone={overview.awaitingReplies ? 'warning' : 'neutral'}
            helper={t('eventForm.overview.awaitingHelper')}
          />
          <StatTile icon="calendar_month" label={t('eventForm.overview.thisMonth')} value={overview.thisMonth} tone="success" />
        </div>
      ) : null}
    </PageHeader>
  );

  if ((Boolean(user) && (profileQuery.isPending || nurseryLoading)) || (Boolean(nurseryId) && eventsQuery.isPending)) {
    return (
      <div className="space-y-5">
        <PageHeader icon="event" title={t('admin.events.title')} description={t('eventForm.listDescription')} />
        <LoadingSkeleton variant="eventCards" eventCardsLabel={t('admin.events.list.loading')} />
      </div>
    );
  }
  if (!nurseryId) {
    return <EmptyState icon="domain" title={t('admin.events.list.noNurseryTitle')} description={t('admin.events.list.noNurseryDescription')} />;
  }

  const noEvents = rows.length === 0;
  const noMatch = !noEvents && shown.length === 0;

  return (
    <div className="space-y-5">
      {header}

      <TableCard
        title={t('eventForm.allEvents')}
        count={t('eventForm.eventsCount', { count: shown.length })}
        actions={<EventsViewToggle value={view} onChange={setView} />}
        filters={
          noEvents ? null : (
            <AdminEventsFilters value={filters} onChange={setFilters} statusCounts={statusCounts} categoryCounts={categoryCounts} locale={locale} />
          )
        }
        pagination={noEvents || noMatch ? null : <TablePagination pager={pager} pageSizeOptions={[6, 12, 24]} />}
      >
        {eventsQuery.isError ? (
          <p className="px-4 py-3 text-sm text-error sm:px-5" role="alert">{t('admin.events.list.loadError')}</p>
        ) : null}

        {view === 'calendar' ? (
          <div className="border-b border-outline-variant p-4 sm:p-5">
            <EventsCalendar
              events={matching}
              viewMonth={viewMonth}
              selectedDateKey={filters.day}
              locale={locale}
              onSelectDate={(day) => setFilters((f) => ({ ...f, day }))}
              onPrevMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              onNextMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              onToday={goToToday}
            />
          </div>
        ) : null}

        {noEvents ? (
          <TableEmpty icon="event_busy" title={t('admin.events.list.emptyTitle')} description={t('admin.events.list.emptyDescription')} action={newEventButton ?? undefined} />
        ) : noMatch ? (
          <TableEmpty
            icon={filters.day ? 'event_available' : 'filter_alt_off'}
            title={filters.day ? t('admin.events.list.noDayEvents') : t('eventForm.noMatchTitle')}
            description={filters.day ? '' : t('eventForm.noMatchDescription')}
            action={
              <Button type="button" variant="outline" onClick={() => setFilters(NO_EVENT_FILTERS)}>
                {t('common.clearFilters')}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
            {pager.pageItems.map((event) => {
              const target = { id: event.id, title: titleOf(event) };
              return (
                <AdminEventCard
                  key={event.id}
                  event={event}
                  title={target.title}
                  stage={stageOf(event)}
                  stats={stats[event.id]}
                  qs={qs}
                  can={can}
                  actions={{
                    publish: () => void actions.publish(target),
                    cancel: () => actions.cancel(target),
                    duplicate: () => void actions.duplicate(target),
                    remove: () => void actions.remove(target),
                    busy: actions.busy,
                  }}
                />
              );
            })}
          </div>
        )}
      </TableCard>

      {actions.dialog}
    </div>
  );
}
