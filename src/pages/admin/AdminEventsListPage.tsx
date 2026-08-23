import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { EventsCalendar } from '@/components/events/EventsCalendar';
import { AdminEventsListCard } from '@/components/admin/AdminEventsListCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useAdminEventPermissionStats } from '@/hooks/useAdminEventPermissionStats';
import {
  inferEventListStatus,
  useAdminEventsList,
  type AdminEventsListCategoryFilter,
  type AdminEventsListDateFilter,
  type AdminEventsListRow,
  type AdminEventsListStatusFilter,
} from '@/hooks/useAdminEventsList';
import { useCanAction } from '@/hooks/usePermissions';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useUserProfile } from '@/hooks/useUserProfile';
import { invalidateAllEventQueries } from '@/lib/eventCache';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { supabase } from '@/lib/supabase';

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: AdminEventsListStatusFilter[] = ['all', 'urgent', 'draft', 'active', 'completed', 'cancelled'];
const CATEGORY_FILTERS: AdminEventsListCategoryFilter[] = ['all', 'trip', 'activity', 'service', 'doctor_visit'];
const DATE_FILTERS: AdminEventsListDateFilter[] = ['all', 'upcoming', 'past'];

const CATEGORY_COLORS: Record<string, string> = {
  trip: 'bg-violet-100 text-violet-900',
  activity: 'bg-blue-100 text-blue-900',
  service: 'bg-amber-100 text-amber-900',
  doctor_visit: 'bg-green-100 text-green-900',
};

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-surface-container text-on-surface';
}

function statusColor(status: ReturnType<typeof inferEventListStatus>) {
  switch (status) {
    case 'draft': return 'border-outline-variant bg-surface-container-highest text-on-surface-variant';
    case 'active': return 'border-transparent bg-secondary-fixed text-on-primary-fixed';
    case 'completed': return 'border-transparent bg-success/10 text-success';
    case 'cancelled': return 'border-transparent bg-error-container text-on-error-container';
    default: return '';
  }
}

// ─── Event detail panel (shown on event click) ────────────────────────────────

type DetailPanelProps = {
  event: AdminEventsListRow | null;
  onClose: () => void;
  qs: string;
  stats: Record<string, { total: number; granted: number; denied: number; pending: number }>;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onDeleteRequest: (id: string) => void;
  onCancelRequest: (id: string) => void;
  onDuplicate: (id: string) => void;
  duplicateBusy: boolean;
};

function EventDetailPanel({
  event,
  onClose,
  qs,
  stats,
  canCreate,
  canUpdate,
  canDelete,
  onDeleteRequest,
  onCancelRequest,
  onDuplicate,
  duplicateBusy,
}: DetailPanelProps) {
  const { t, i18n } = useTranslation();
  if (!event) return null;
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const title = (isAr ? event.title_ar : event.title_en) || event.title_en || event.title_ar;
  const listStatus = inferEventListStatus(event);
  const stat = stats[event.id];
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', hour12: true });
  const urgentSchedule = summarizeUrgentSchedule(event, t);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-2">
            <Badge className={`${categoryColor(event.category)} border-transparent text-xs`}>
              {t(`admin.events.create.categories.${event.category}`)}
            </Badge>
            <Badge className={`${statusColor(listStatus)} text-xs`}>
              {t(`admin.events.list.statusTab.${listStatus}`)}
            </Badge>
            {event.is_paid ? (
              <Badge className="border-transparent bg-amber-100 text-amber-900 text-xs">
                {t('admin.events.create.fields.isPaid')}
              </Badge>
            ) : null}
            {event.is_urgent ? (
              <Badge className="border-transparent bg-error-container text-error text-xs">
                {t('admin.events.list.urgentBadge')}
              </Badge>
            ) : null}
          </div>
          <DialogTitle className="mt-2 text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs text-on-surface-variant">
            {dateFmt.format(new Date(event.starts_at))}
          </DialogDescription>
          {urgentSchedule ? (
            <p className="text-xs font-medium text-error">{urgentSchedule}</p>
          ) : null}
        </DialogHeader>

        {/* Permission stats */}
        {stat && stat.total > 0 ? (
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-center text-xs">
            <div>
              <p className="text-lg font-bold text-success">{stat.granted}</p>
              <p className="text-on-surface-variant">{t('admin.events.details.statApproved')}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface-variant">{stat.pending}</p>
              <p className="text-on-surface-variant">{t('admin.events.details.statPending')}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-error">{stat.denied}</p>
              <p className="text-on-surface-variant">{t('admin.events.details.statDenied')}</p>
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link to={`/admin/events/${event.id}${qs}`}>{t('admin.events.details.viewTitle', { defaultValue: 'View details' })}</Link>
          </Button>
          {canUpdate && listStatus !== 'cancelled' && listStatus !== 'completed' ? (
            <Button asChild variant="outline" className="w-full">
              <Link to={`/admin/events/${event.id}/edit${qs}`}>{t('admin.events.edit.title')}</Link>
            </Button>
          ) : null}
          {canCreate ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={duplicateBusy}
              onClick={() => { onDuplicate(event.id); onClose(); }}
            >
              {t('admin.events.list.actions.duplicate')}
            </Button>
          ) : null}
          {canUpdate && (listStatus === 'active' || listStatus === 'draft') ? (
            <Button
              variant="outline"
              className="w-full text-error hover:bg-error/5"
              onClick={() => { onCancelRequest(event.id); onClose(); }}
            >
              {t('admin.events.details.cancelTitle')}
            </Button>
          ) : null}
          {canDelete && (listStatus === 'draft' || listStatus === 'cancelled') ? (
            <Button
              variant="outline"
              className="w-full text-error hover:bg-error/5"
              onClick={() => { onDeleteRequest(event.id); onClose(); }}
            >
              {t('admin.events.list.actions.delete')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function AdminEventsListPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const profileQuery = useUserProfile(user?.id);
  const { activeNurseryId: nurseryId, isLoading: activeNurseryLoading } = useActiveNurseryId();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';

  const canCreate = useCanAction('event_calendar', 'create');
  const canUpdate = useCanAction('event_calendar', 'update');
  const canDelete = useCanAction('event_calendar', 'delete');

  // ── view & filter state ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [statusFilter, setStatusFilter] = useState<AdminEventsListStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<AdminEventsListCategoryFilter>('all');
  const [dateFilter, setDateFilter] = useState<AdminEventsListDateFilter>('all');
  const [titleSearch, setTitleSearch] = useState('');
  const debouncedSearch = useDebouncedValue(titleSearch, 300);

  // ── calendar state ─────────────────────────────────────────────────────────
  const [viewMonth, setViewMonth] = useState(() => {
    const monthParam = searchParams.get('month');
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      return new Date(y, (m ?? 1) - 1, 1);
    }
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AdminEventsListRow | null>(null);

  // ── action dialogs ─────────────────────────────────────────────────────────
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [cancelEventId, setCancelEventId] = useState<string | null>(null);

  // ── data ────────────────────────────────────────────────────────────────────
  const eventsQuery = useAdminEventsList({ nurseryId, statusFilter, categoryFilter, dateFilter });

  const events = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = eventsQuery.filtered;
    if (q) {
      list = list.filter(
        (e) => e.title_ar.toLowerCase().includes(q) || e.title_en.toLowerCase().includes(q),
      );
    }
    if (viewMode === 'calendar' && selectedDateKey) {
      list = list.filter((e) => {
        const d = new Date(e.starts_at);
        const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return dk === selectedDateKey;
      });
    }
    return list;
  }, [eventsQuery.filtered, debouncedSearch, viewMode, selectedDateKey]);

  const allIds = useMemo(() => (eventsQuery.data ?? []).map((e) => e.id), [eventsQuery.data]);
  const statsQuery = useAdminEventPermissionStats(allIds);
  const statsMap = statsQuery.data ?? {};

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidateLists = async () => {
    // Refresh every event cache (list/popup, detail, edit, stats) so the same
    // event never shows different data across surfaces.
    await invalidateAllEventQueries(queryClient);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id).eq('nursery_id', nurseryId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('admin.events.list.deleteSuccess'));
      setDeleteEventId(null);
      await invalidateLists();
    },
    onError: () => toast.error(t('admin.events.list.deleteError')),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('events')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() } as never)
        .eq('id', id)
        .eq('nursery_id', nurseryId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('admin.events.details.cancelSuccess'));
      setCancelEventId(null);
      await invalidateLists();
    },
    onError: () => toast.error(t('admin.events.details.cancelError')),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!nurseryId) throw new Error('no_nursery');
      const { data: row, error } = await supabase
        .from('events')
        .select('title_ar, title_en, description_ar, description_en, starts_at, ends_at, location, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, is_paid, price, target_scope, target_class_id, permission_deadline')
        .eq('id', id).eq('nursery_id', nurseryId).maybeSingle();
      if (error) throw error;
      if (!row) throw new Error('not_found');
      const r = row as {
        title_ar: string; title_en: string; description_ar: string | null; description_en: string | null;
        starts_at: string; ends_at: string | null; location: string | null; category: string;
        is_urgent: boolean; urgent_days_of_week: number[]; urgent_hours_of_day: number[]; urgent_repeats_weekly: boolean;
        is_paid: boolean; price: string | null; target_scope: string; target_class_id: string | null;
        permission_deadline: string | null;
      };
      const suffixAr = ` (${t('admin.events.list.duplicateSuffixAr')})`;
      const suffixEn = ` (${t('admin.events.list.duplicateSuffixEn')})`;
      const { error: insErr } = await supabase.from('events').insert({
        nursery_id: nurseryId, title_ar: `${r.title_ar}${suffixAr}`, title_en: `${r.title_en}${suffixEn}`,
        description_ar: r.description_ar, description_en: r.description_en, starts_at: r.starts_at,
        ends_at: r.ends_at, location: r.location, category: r.category, is_urgent: r.is_urgent, is_paid: r.is_paid,
        urgent_days_of_week: r.urgent_days_of_week, urgent_hours_of_day: r.urgent_hours_of_day,
        urgent_repeats_weekly: r.urgent_repeats_weekly, price: r.price,
        target_scope: r.target_scope, target_class_id: r.target_class_id,
        permission_deadline: r.permission_deadline, status: 'draft', cancelled_at: null,
      } as never);
      if (insErr) throw insErr;
    },
    onSuccess: async () => { toast.success(t('admin.events.list.duplicateSuccess')); await invalidateLists(); },
    onError: () => toast.error(t('admin.events.list.duplicateError')),
  });

  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  const eventTitle = (e: AdminEventsListRow) =>
    (isAr ? e.title_ar : e.title_en) || e.title_en || e.title_ar;

  const showSkeleton =
    (Boolean(user) && (profileQuery.isPending || activeNurseryLoading)) ||
    (Boolean(nurseryId) && eventsQuery.isPending);
  const allEvents = eventsQuery.data ?? [];

  // ── calendar-mode: events for the visible month (no date filter applied) ──
  const calendarEvents = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = eventsQuery.filtered;
    if (q) list = list.filter((e) => e.title_ar.toLowerCase().includes(q) || e.title_en.toLowerCase().includes(q));
    return list;
  }, [eventsQuery.filtered, debouncedSearch]);

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-on-surface">{t('admin.events.title')}</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex overflow-hidden rounded-lg border border-outline-variant">
            <button
              type="button"
              className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
              }`}
              onClick={() => setViewMode('calendar')}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>calendar_month</span>
              <span className="hidden sm:inline">{t('admin.events.list.viewCalendar', { defaultValue: 'Calendar' })}</span>
            </button>
            <button
              type="button"
              className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
              }`}
              onClick={() => { setViewMode('list'); setSelectedDateKey(null); }}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>view_list</span>
              <span className="hidden sm:inline">{t('admin.events.list.viewList', { defaultValue: 'List' })}</span>
            </button>
          </div>
          {canCreate ? (
            <Button asChild className="shrink-0">
              <Link to={`/admin/events/create${qs}`}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
                {t('admin.events.new')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status chips */}
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
            onClick={() => setStatusFilter(s)}
          >
            {t(`admin.events.list.statusTab.${s}`)}
          </button>
        ))}
        <span className="text-outline-variant">|</span>
        {/* Category chips */}
        {CATEGORY_FILTERS.map((c) => (
          <button
            key={c}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === c
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
            onClick={() => setCategoryFilter(c)}
          >
            {t(`admin.events.list.categoryOption.${c}`)}
          </button>
        ))}
        <span className="text-outline-variant">|</span>
        {/* Date chips */}
        {DATE_FILTERS.map((d) => (
          <button
            key={d}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              dateFilter === d
                ? 'bg-tertiary text-on-tertiary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
            onClick={() => setDateFilter(d)}
          >
            {t(`admin.events.list.dateOption.${d}`)}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <span className="material-symbols-outlined pointer-events-none absolute start-3 top-2.5 text-on-surface-variant text-base">search</span>
        <Input
          type="search"
          value={titleSearch}
          onChange={(e) => setTitleSearch(e.target.value)}
          placeholder={t('admin.events.list.searchPlaceholder')}
          className="ps-10"
          autoComplete="off"
        />
      </div>

      {/* ── Loading ── */}
      {showSkeleton ? <LoadingSkeleton /> : null}
      {eventsQuery.isError ? (
        <p className="text-sm text-error" role="alert">{t('admin.events.list.loadError')}</p>
      ) : null}

      {/* ── No nursery ── */}
      {user && !profileQuery.isPending && !nurseryId ? (
        <EmptyState icon="domain" title={t('admin.events.list.noNurseryTitle')} description={t('admin.events.list.noNurseryDescription')} />
      ) : null}

      {/* ── Calendar view ── */}
      {viewMode === 'calendar' && !showSkeleton && nurseryId ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
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

          {/* Selected day event list */}
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
              {events.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  {t('admin.events.list.noDayEvents', { defaultValue: 'No events on this day.' })}
                </p>
              ) : (
                events.map((event) => (
                  <AdminEventsListCard
                    key={event.id}
                    event={event}
                    qs={qs}
                    stats={statsMap[event.id]}
                    dateTimeFmt={dateTimeFmt}
                    eventTitle={eventTitle}
                    canCreate={canCreate}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onDeleteRequest={setDeleteEventId}
                    onCancelRequest={setCancelEventId}
                    onDuplicate={(id) => duplicateMutation.mutate(id)}
                    duplicateBusy={duplicateMutation.isPending}
                  />
                ))
              )}
            </div>
          ) : allEvents.length === 0 && !showSkeleton ? (
            <EmptyState
              icon="event_busy"
              title={t('admin.events.list.emptyTitle')}
              description={t('admin.events.list.emptyDescription')}
              action={
                canCreate ? (
                  <Button asChild>
                    <Link to={`/admin/events/create${qs}`}>{t('admin.events.list.createEvent')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : null}
        </div>
      ) : null}

      {/* ── List view ── */}
      {viewMode === 'list' && !showSkeleton && nurseryId ? (
        <div className="space-y-3">
          {events.length === 0 ? (
            <EmptyState
              icon="event_busy"
              title={t('admin.events.list.emptyTitle')}
              description={t('admin.events.list.emptyDescription')}
              action={
                canCreate ? (
                  <Button asChild>
                    <Link to={`/admin/events/create${qs}`}>{t('admin.events.list.createEvent')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            events.map((event) => (
              <AdminEventsListCard
                key={event.id}
                event={event}
                qs={qs}
                stats={statsMap[event.id]}
                dateTimeFmt={dateTimeFmt}
                eventTitle={eventTitle}
                canCreate={canCreate}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onDeleteRequest={setDeleteEventId}
                onCancelRequest={setCancelEventId}
                onDuplicate={(id) => duplicateMutation.mutate(id)}
                duplicateBusy={duplicateMutation.isPending}
              />
            ))
          )}
        </div>
      ) : null}

      {/* ── Event detail panel (calendar click) ── */}
      <EventDetailPanel
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        qs={qs}
        stats={statsMap}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onDeleteRequest={(id) => { setDeleteEventId(id); setSelectedEvent(null); }}
        onCancelRequest={(id) => { setCancelEventId(id); setSelectedEvent(null); }}
        onDuplicate={(id) => duplicateMutation.mutate(id)}
        duplicateBusy={duplicateMutation.isPending}
      />

      {/* ── Delete dialog ── */}
      <Dialog open={Boolean(deleteEventId)} onOpenChange={(open) => !open && setDeleteEventId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.events.list.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('admin.events.list.deleteDescription')}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteEventId(null)}>
              {t('admin.events.list.deleteCancel')}
            </Button>
            <Button
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteEventId) deleteMutation.mutate(deleteEventId); }}
            >
              {t('admin.events.list.deleteConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel dialog ── */}
      <Dialog open={Boolean(cancelEventId)} onOpenChange={(open) => !open && setCancelEventId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.events.details.cancelTitle')}</DialogTitle>
            <DialogDescription>{t('admin.events.details.cancelDescription')}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCancelEventId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-error text-white hover:bg-error/90"
              disabled={cancelMutation.isPending}
              onClick={() => { if (cancelEventId) cancelMutation.mutate(cancelEventId); }}
            >
              {t('admin.events.details.cancelConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
