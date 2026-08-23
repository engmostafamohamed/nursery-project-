import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ParentEventsCalendar } from '@/components/parent/ParentEventsCalendar';
import { ParentEventsEventCard } from '@/components/parent/ParentEventsEventCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useParentEventsCatalog, type ParentCatalogPermissionRow } from '@/hooks/useParentEventsCatalog';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localDateKeyFromIso } from '@/lib/parentEventsCalendarUtils';

type TabFilter = 'all' | 'urgent' | 'mine' | 'upcoming' | 'past';
type CategoryFilter = 'all' | 'trip' | 'activity' | 'service' | 'doctor_visit';
type SortMode = 'starts_at' | 'deadline';

function eventHasGranted(eventId: string, permissions: ParentCatalogPermissionRow[]): boolean {
  return permissions.some((p) => p.event_id === eventId && p.status === 'granted');
}

function parseLocalDateKey(key: string): Date {
  const [y, mo, d] = key.split('-').map(Number);
  return new Date(y, (mo ?? 1) - 1, d ?? 1);
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
  const dayBannerFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });

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

  if (!parentId) {
    return null;
  }

  if (catalogQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl lg:max-w-none space-y-4 px-4 pb-28 pt-2">
        <h1 className="text-lg font-semibold text-on-surface">{t('parent.events.pageTitle')}</h1>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('parent.events.toggleViewLabel')}>
          <Button
            type="button"
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            {t('parent.events.viewList')}
          </Button>
          <Button
            type="button"
            variant={viewMode === 'calendar' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('calendar')}
          >
            {t('parent.events.viewCalendar')}
          </Button>
        </div>
        {viewMode === 'calendar' ? (
          <LoadingSkeleton variant="parentEventsCalendar" parentEventsCalendarLabel={t('parent.events.loadingCalendar')} />
        ) : null}
        <LoadingSkeleton variant="eventCards" eventCardsLabel={t('parent.events.loadingList')} />
      </div>
    );
  }

  if (catalogQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl lg:max-w-none px-4 py-6">
        <p className="text-sm text-error" role="alert">
          {t('parent.events.loadCatalogError')}
        </p>
      </div>
    );
  }

  if (!nurseryId) {
    return (
      <div className="mx-auto max-w-4xl lg:max-w-none px-4 py-6">
        <EmptyState icon="calendar_month" title={t('parent.events.noNursery')} description={t('parent.permissions.noNurseryDescription', { defaultValue: '' })} />
      </div>
    );
  }

  const showEmptyAll = events.length === 0;
  const showEmptyFilters = !showEmptyAll && filtered.length === 0;

  const pendingPermissions = permissions.filter((p) => p.status === 'pending').length;
  const upcomingCount = events.filter((e) => new Date(e.starts_at).getTime() > nowMs).length;
  const urgentCount = events.filter((e) => e.is_urgent).length;

  return (
    <div className="mx-auto max-w-4xl lg:max-w-none space-y-4 px-4 pb-28 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <span className="material-symbols-outlined text-2xl" aria-hidden>calendar_month</span>
          </span>
          <h1 className="text-xl font-semibold text-on-surface">{t('parent.events.pageTitle')}</h1>
        </div>
        <Button asChild>
          <Link to="/parent/events/create" className="gap-1">
            <span className="material-symbols-outlined text-base" aria-hidden>
              priority_high
            </span>
            {t('parent.events.create.button')}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-lg text-primary" aria-hidden>event</span>
          {t('parent.events.totalCount', { count: events.length })}
        </div>
        {upcomingCount > 0 ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-lg text-primary" aria-hidden>upcoming</span>
            {t('parent.events.upcomingCount', { count: upcomingCount })}
          </div>
        ) : null}
        {urgentCount > 0 ? (
          <div className="flex items-center gap-2 text-sm text-error">
            <span className="material-symbols-outlined text-lg" aria-hidden>priority_high</span>
            {t('parent.events.urgentCount', { count: urgentCount })}
          </div>
        ) : null}
        {pendingPermissions > 0 ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-lg text-primary" aria-hidden>pending_actions</span>
            {t('parent.events.pendingPermissions', { count: pendingPermissions })}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('parent.events.toggleViewLabel')}>
        <Button
          type="button"
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          className="gap-1"
          onClick={() => setViewMode('list')}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>
            view_list
          </span>
          {t('parent.events.viewList')}
        </Button>
        <Button
          type="button"
          variant={viewMode === 'calendar' ? 'default' : 'outline'}
          size="sm"
          className="gap-1"
          onClick={() => setViewMode('calendar')}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>
            calendar_month
          </span>
          {t('parent.events.viewCalendar')}
        </Button>
      </div>

      {viewMode === 'calendar' ? (
        <ParentEventsCalendar
          viewMonth={viewMonth}
          allEvents={events}
          selectedDateKey={selectedDateKey}
          onSelectDate={setSelectedDateKey}
          onPrevMonth={() =>
            setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
          }
          onNextMonth={() =>
            setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
          }
          locale={locale}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('parent.events.tabListLabel')}>
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                tab === key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
              }`}
              onClick={() => setTab(key)}
            >
              {t(TAB_LABEL[key])}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
          <label htmlFor="parent-events-category" className="text-xs text-on-surface-variant">
            {t('parent.events.categoryFilter')}
          </label>
          <select
            id="parent-events-category"
            className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryFilter)}
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {t(`parent.events.categories.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:max-w-[10rem]">
          <label htmlFor="parent-events-sort" className="text-xs text-on-surface-variant">
            {t('parent.events.sortLabel')}
          </label>
          <select
            id="parent-events-sort"
            className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="starts_at">{t('parent.events.sortByDate')}</option>
            <option value="deadline">{t('parent.events.sortByDeadline')}</option>
          </select>
        </div>
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="parent-events-search" className="sr-only">
            {t('parent.events.searchPlaceholder')}
          </label>
          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute start-3 top-2.5 text-on-surface-variant text-base">
              search
            </span>
            <input
              id="parent-events-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('parent.events.searchPlaceholder')}
              className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest py-2 ps-10 pe-3 text-sm text-on-surface"
            />
          </div>
        </div>
      </div>

      {selectedDateKey ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm">
          <Badge className="border-transparent bg-secondary/15 text-on-secondary-container">
            {t('parent.events.selectedDayBanner', {
              date: dayBannerFmt.format(parseLocalDateKey(selectedDateKey)),
            })}
          </Badge>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedDateKey(null)}>
            {t('parent.events.clearDateFilter')}
          </Button>
        </div>
      ) : null}

      {showEmptyAll ? (
        <EmptyState
          icon="event_busy"
          title={t('parent.events.emptyScheduled')}
          description={t('parent.events.emptyScheduledDescription')}
        />
      ) : null}

      {showEmptyFilters ? (
        <EmptyState
          icon="filter_alt_off"
          title={t('parent.events.emptyFilters')}
          description={t('parent.events.emptyFiltersDescription')}
        />
      ) : null}

      {!showEmptyAll && !showEmptyFilters ? (
        <div className="space-y-3">
          {filtered.map((e) => (
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
      ) : null}
    </div>
  );
}
