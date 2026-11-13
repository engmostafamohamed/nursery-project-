import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EventsCalendar } from '@/components/events/EventsCalendar';
import { EventsViewToggle } from '@/components/events/EventsViewToggle';
import { SelectedDayChip } from '@/components/events/SelectedDayChip';
import { ParentEventsEventCard } from '@/components/parent/ParentEventsEventCard';
import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TablePagination } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePagination } from '@/hooks/usePagination';
import { useParentEventsCatalog, type ParentCatalogPermissionRow } from '@/hooks/useParentEventsCatalog';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localDateKeyFromIso } from '@/lib/parentEventsCalendarUtils';

type TabFilter = 'all' | 'urgent' | 'mine' | 'upcoming' | 'past';
type CategoryFilter = 'all' | 'trip' | 'activity' | 'service' | 'doctor_visit';
type SortMode = 'starts_at' | 'deadline';

function eventHasGranted(eventId: string, permissions: ParentCatalogPermissionRow[]): boolean {
  return permissions.some((p) => p.event_id === eventId && p.status === 'granted');
}

const TABS: TabFilter[] = ['all', 'urgent', 'mine', 'upcoming', 'past'];
const TAB_LABEL: Record<TabFilter, string> = {
  all: 'parent.events.tabAll',
  urgent: 'parent.events.tabUrgent',
  mine: 'parent.events.tabMine',
  upcoming: 'parent.events.tabUpcoming',
  past: 'parent.events.tabPast',
};
const CATS: CategoryFilter[] = ['all', 'trip', 'activity', 'service', 'doctor_visit'];

export function ParentEventsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const parentId = user?.id;
  const profileQuery = useUserProfile(parentId);
  const catalogQuery = useParentEventsCatalog(parentId, profileQuery.data?.nursery_id);

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [tab, setTab] = useState<TabFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('starts_at');

  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  const deadlineFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  const events = useMemo(() => catalogQuery.data?.events ?? [], [catalogQuery.data?.events]);
  const permissions = useMemo(() => catalogQuery.data?.permissions ?? [], [catalogQuery.data?.permissions]);
  const nurseryId = catalogQuery.data?.nurseryId;

  const [nowMs] = useState(Date.now);
  const filtered = useMemo(() => {
    let list = [...events];
    const now = nowMs;

    if (tab === 'mine') {
      list = list.filter((e) => eventHasGranted(e.id, permissions));
    } else if (tab === 'urgent') {
      list = list.filter((e) => e.is_urgent);
    } else if (tab === 'upcoming') {
      list = list.filter((e) => new Date(e.starts_at).getTime() > now);
    } else if (tab === 'past') {
      list = list.filter((e) => new Date(e.starts_at).getTime() <= now);
    }

    if (category !== 'all') {
      list = list.filter((e) => e.category === category);
    }

    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.title_ar.toLowerCase().includes(q) || e.title_en.toLowerCase().includes(q),
      );
    }

    if (selectedDateKey) {
      list = list.filter((e) => localDateKeyFromIso(e.starts_at) === selectedDateKey);
    }

    list.sort((a, b) => {
      if (sortMode === 'deadline') {
        const da = a.permission_deadline ? new Date(a.permission_deadline).getTime() : Number.POSITIVE_INFINITY;
        const db = b.permission_deadline ? new Date(b.permission_deadline).getTime() : Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
      }
      return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
    });
    return list;
  }, [events, permissions, tab, category, debouncedSearch, selectedDateKey, sortMode, nowMs]);

  const pager = usePagination(filtered, 6, `${tab}|${category}|${debouncedSearch}|${selectedDateKey}|${sortMode}`);
  const filtersActive = tab !== 'all' || category !== 'all' || sortMode !== 'starts_at' || Boolean(search.trim()) || Boolean(selectedDateKey);
  const clearFilters = () => {
    setTab('all');
    setCategory('all');
    setSortMode('starts_at');
    setSearch('');
    setSelectedDateKey(null);
  };
  const goToToday = () => {
    const n = new Date();
    setViewMonth(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelectedDateKey(null);
  };

  if (!parentId) {
    return null;
  }

  if (catalogQuery.isPending) {
    return (
      <div className="space-y-5 pb-28">
        <PageHeader icon="event" title={t('parent.events.pageTitle')} description={t('parent.events.pageSubtitle')} />
        {viewMode === 'calendar' ? (
          <LoadingSkeleton variant="parentEventsCalendar" parentEventsCalendarLabel={t('parent.events.loadingCalendar')} />
        ) : null}
        <LoadingSkeleton variant="eventCards" eventCardsLabel={t('parent.events.loadingList')} />
      </div>
    );
  }

  if (catalogQuery.isError) {
    return (
      <div className="space-y-5 pb-28">
        <PageHeader icon="event" title={t('parent.events.pageTitle')} />
        <EmptyState icon="error" title={t('parent.events.loadCatalogError')} description="" />
      </div>
    );
  }

  if (!nurseryId) {
    return (
      <EmptyState icon="calendar_month" title={t('parent.events.noNursery')} description={t('parent.permissions.noNurseryDescription', { defaultValue: '' })} />
    );
  }

  const showEmptyAll = events.length === 0;
  const showEmptyFilters = !showEmptyAll && filtered.length === 0;

  const pendingPermissions = permissions.filter((p) => p.status === 'pending').length;
  const upcomingCount = events.filter((e) => new Date(e.starts_at).getTime() > nowMs).length;
  const urgentCount = events.filter((e) => e.is_urgent).length;
  const toggleTab = (value: TabFilter) => setTab((current) => (current === value ? 'all' : value));

  return (
    <div className="space-y-5 pb-28">
      <PageHeader
        icon="event"
        title={t('parent.events.pageTitle')}
        description={t('parent.events.pageSubtitle')}
        actions={
          <Button asChild>
            <Link to="/parent/events/create">
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>priority_high</span>
              {t('parent.events.create.button')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="event" label={t('parent.events.tabAll')} value={events.length} onClick={() => setTab('all')} active={tab === 'all'} />
          <StatTile
            icon="upcoming"
            label={t('parent.events.tabUpcoming')}
            value={upcomingCount}
            tone="success"
            onClick={() => toggleTab('upcoming')}
            active={tab === 'upcoming'}
          />
          <StatTile
            icon="priority_high"
            label={t('parent.events.tabUrgent')}
            value={urgentCount}
            tone={urgentCount > 0 ? 'error' : 'neutral'}
            onClick={() => toggleTab('urgent')}
            active={tab === 'urgent'}
          />
          <StatTile
            icon="pending_actions"
            label={t('parent.events.pendingPermissionsLabel')}
            value={pendingPermissions}
            tone={pendingPermissions > 0 ? 'warning' : 'neutral'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('parent.events.pageTitle')}
        count={t('parent.events.totalCount', { count: filtered.length })}
        actions={
          <EventsViewToggle value={viewMode} onChange={setViewMode} />
        }
        filters={
          showEmptyAll ? null : (
            <div className="space-y-3">
              <FilterChips
                label={t('parent.events.tabListLabel')}
                value={tab}
                onChange={setTab}
                options={TABS.map((key) => ({ value: key, label: t(TAB_LABEL[key]) }))}
              />
              <FilterBar onClear={clearFilters} canClear={filtersActive}>
                <FilterField label={t('parent.events.categoryFilter')}>
                  <Select value={category} onChange={(e) => setCategory(e.target.value as CategoryFilter)}>
                    {CATS.map((c) => (
                      <option key={c} value={c}>{t(`parent.events.categories.${c}`)}</option>
                    ))}
                  </Select>
                </FilterField>
                <FilterField label={t('parent.events.sortLabel')}>
                  <Select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                    <option value="starts_at">{t('parent.events.sortByDate')}</option>
                    <option value="deadline">{t('parent.events.sortByDeadline')}</option>
                  </Select>
                </FilterField>
                <FilterField label={t('common.search')} className="sm:flex-[2]">
                  <SearchInput value={search} onChange={setSearch} placeholder={t('parent.events.searchPlaceholder')} />
                </FilterField>
              </FilterBar>
              {selectedDateKey ? <SelectedDayChip dateKey={selectedDateKey} locale={locale} onClear={() => setSelectedDateKey(null)} /> : null}
            </div>
          )
        }
        pagination={showEmptyAll || showEmptyFilters ? null : <TablePagination pager={pager} pageSizeOptions={[6, 12, 24]} />}
      >
        {viewMode === 'calendar' ? (
          <div className="border-b border-outline-variant p-4 sm:p-5">
            <EventsCalendar
              viewMonth={viewMonth}
              events={events}
              selectedDateKey={selectedDateKey}
              onSelectDate={setSelectedDateKey}
              onPrevMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              onNextMonth={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              onToday={goToToday}
              locale={locale}
            />
          </div>
        ) : null}

        {showEmptyAll ? (
          <TableEmpty icon="event_busy" title={t('parent.events.emptyScheduled')} description={t('parent.events.emptyScheduledDescription')} />
        ) : showEmptyFilters ? (
          <TableEmpty
            icon="filter_alt_off"
            title={t('parent.events.emptyFilters')}
            description={t('parent.events.emptyFiltersDescription')}
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                {t('common.clearFilters')}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
            {pager.pageItems.map((e) => (
              <ParentEventsEventCard
                key={e.id}
                event={e}
                permissions={permissions}
                dateTimeFmt={dateTimeFmt}
                deadlineFmt={deadlineFmt}
                priceFmt={priceFmt}
              />
            ))}
          </div>
        )}
      </TableCard>
    </div>
  );
}
