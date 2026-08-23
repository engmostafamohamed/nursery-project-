import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminEventDetailsAttendanceSection } from '@/components/admin/AdminEventDetailsAttendanceSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  useAdminEventAttendance,
  useAdminEventDetail,
} from '@/hooks/useAdminEventDetails';
import {
  inferEventListStatus,
  type AdminEventsListRow,
} from '@/hooks/useAdminEventsList';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { invalidateAllEventQueries } from '@/lib/eventCache';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { supabase } from '@/lib/supabase';

function listStatusBadgeClass(s: ReturnType<typeof inferEventListStatus>): string {
  switch (s) {
    case 'draft':
      return 'border-outline-variant bg-surface-container-highest text-on-surface-variant';
    case 'active':
      return 'border-transparent bg-secondary-fixed text-on-primary-fixed';
    case 'completed':
      return 'border-transparent bg-success/10 text-success';
    case 'cancelled':
      return 'border-transparent bg-error-container text-on-error-container';
    default:
      return 'border-outline-variant bg-surface-container text-on-surface';
  }
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case 'trip':
      return 'border-transparent bg-violet-100 text-violet-900';
    case 'activity':
      return 'border-transparent bg-info/10 text-info';
    case 'service':
      return 'border-transparent bg-accent text-accent-foreground';
    case 'doctor_visit':
      return 'border-transparent bg-success/10 text-success';
    default:
      return 'border-outline-variant bg-surface-container text-on-surface';
  }
}

const CATEGORY_ICON: Record<string, string> = {
  trip: 'directions_bus',
  activity: 'celebration',
  service: 'volunteer_activism',
  doctor_visit: 'medical_services',
};
function categoryIcon(category: string): string {
  return CATEGORY_ICON[category] ?? 'event';
}

function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-low p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MaterialSymbol name={icon} size="text-lg" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-on-surface-variant">{label}</p>
        <p className="truncate text-sm font-medium text-on-surface">{value}</p>
      </div>
    </div>
  );
}

export function AdminEventDetailsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const profileQuery = useUserProfile(user?.id);
  const nurseryId = profileQuery.data?.nursery_id;
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOnCancel, setRefundOnCancel] = useState(false);

  const eventQuery = useAdminEventDetail(eventId, nurseryId);
  const attendanceQuery = useAdminEventAttendance(eventId, nurseryId);
  const eventRow = eventQuery.data;

  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  const displayTitle = (row: NonNullable<typeof eventRow>) =>
    (i18n.language.startsWith('ar') ? row.title_ar : row.title_en) || row.title_en || row.title_ar;
  const displayDescription = (row: NonNullable<typeof eventRow>) => {
    const d = i18n.language.startsWith('ar') ? row.description_ar : row.description_en;
    return d?.trim() || null;
  };
  const classDisplay = (row: NonNullable<typeof eventRow>) =>
    (i18n.language.startsWith('ar') ? row.classNameAr : row.classNameEn) ||
    row.classNameEn ||
    row.classNameAr;

  const invalidateEvent = async () => {
    // Refresh every event cache so the popup / list, view, and edit stay in sync.
    await invalidateAllEventQueries(queryClient);
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !nurseryId) throw new Error('missing');
      const { error } = await supabase.from('events').delete().eq('id', eventId).eq('nursery_id', nurseryId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('admin.events.details.deleteSuccess'));
      setDeleteOpen(false);
      await invalidateAllEventQueries(queryClient);
      navigate(`/admin/events${qs}`);
    },
    onError: () => toast.error(t('admin.events.details.deleteError')),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !nurseryId) throw new Error('missing');
      const { error } = await supabase
        .from('events')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        } as never)
        .eq('id', eventId)
        .eq('nursery_id', nurseryId);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (refundOnCancel) {
        toast.info(t('admin.events.details.refundQueued'));
      }
      toast.success(t('admin.events.details.cancelSuccess'));
      setCancelOpen(false);
      setRefundOnCancel(false);
      await invalidateEvent();
    },
    onError: () => toast.error(t('admin.events.details.cancelError')),
  });

  const showEventLoading =
    Boolean(user) && (profileQuery.isPending || (Boolean(nurseryId) && eventQuery.isPending));

  if (showEventLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-1 pb-8">
        <LoadingSkeleton />
      </div>
    );
  }

  if (user && !profileQuery.isPending && !nurseryId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-on-surface-variant">{t('admin.events.list.noNurseryDescription')}</p>
        <Button asChild variant="outline">
          <Link to={`/admin/events${qs}`}>{t('admin.events.edit.backToList')}</Link>
        </Button>
      </div>
    );
  }

  if (!eventId || (!eventQuery.isPending && !eventQuery.isError && eventRow === null)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error" role="alert">
          {t('admin.events.details.notFound')}
        </p>
        <Button asChild variant="outline">
          <Link to={`/admin/events${qs}`}>{t('admin.events.edit.backToList')}</Link>
        </Button>
      </div>
    );
  }

  if (eventQuery.isError || !eventRow) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error" role="alert">
          {t('admin.events.details.loadError')}
        </p>
        <Button asChild variant="outline">
          <Link to={`/admin/events${qs}`}>{t('admin.events.edit.backToList')}</Link>
        </Button>
      </div>
    );
  }

  const listStatus = inferEventListStatus(eventRow as AdminEventsListRow);
  const deadlineIso = eventRow.permission_deadline;
  const urgentSchedule = summarizeUrgentSchedule(eventRow, t);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-1 pb-8">
      <nav className="text-sm text-on-surface-variant" aria-label={t('admin.events.details.breadcrumbLabel')}>
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link className="text-secondary underline hover:no-underline" to={`/admin/events${qs}`}>
              {t('admin.events.details.breadcrumbEvents')}
            </Link>
          </li>
          <li aria-hidden className="flex text-on-surface-variant">
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </li>
          <li className="truncate text-on-surface">{displayTitle(eventRow)}</li>
        </ol>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-low p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MaterialSymbol name={categoryIcon(eventRow.category)} size="text-2xl" />
            </span>
            <div className="min-w-0 space-y-2">
              <h1 className="text-xl font-semibold text-on-surface">{displayTitle(eventRow)}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={listStatusBadgeClass(listStatus)}>
                  {t(`admin.events.list.statusBadge.${listStatus}`)}
                </Badge>
                <Badge className={categoryBadgeClass(eventRow.category)}>
                  {t(`admin.events.create.categories.${eventRow.category}`, { defaultValue: eventRow.category })}
                </Badge>
                {eventRow.is_urgent ? (
                  <Badge className="border-transparent bg-error text-white">
                    {t('admin.events.list.urgentBadge')}
                  </Badge>
                ) : null}
                <Badge className="border-outline-variant bg-surface-container text-on-surface">
                  {t(`admin.events.list.scope.${eventRow.target_scope}`, { defaultValue: eventRow.target_scope })}
                </Badge>
                <Badge
                  className={
                    eventRow.is_paid
                      ? 'border-transparent bg-amber-100 text-amber-900'
                      : 'border-outline-variant bg-surface-container text-on-surface-variant'
                  }
                >
                  {eventRow.is_paid && eventRow.price
                    ? priceFmt.format(Number(eventRow.price))
                    : t('admin.events.details.notPaid')}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/events/${eventId}/edit${qs}`}>{t('admin.events.actions.edit')}</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              {t('admin.events.details.delete')}
            </Button>
            {listStatus === 'active' ? (
              <Button
                type="button"
                size="sm"
                className="bg-error text-white hover:bg-error/90"
                onClick={() => setCancelOpen(true)}
              >
                {t('admin.events.details.cancelEvent')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoTile
            icon="event"
            label={t('admin.events.details.whenLabel')}
            value={dateFmt.format(new Date(eventRow.starts_at))}
          />
          <InfoTile
            icon="location_on"
            label={t('admin.events.details.whereLabel')}
            value={eventRow.location || '—'}
          />
          {eventRow.target_scope === 'class' ? (
            <InfoTile
              icon="school"
              label={t('admin.events.details.className')}
              value={classDisplay(eventRow) || '—'}
            />
          ) : null}
          <InfoTile
            icon="payments"
            label={t('admin.events.details.costLabel')}
            value={
              eventRow.is_paid && eventRow.price
                ? priceFmt.format(Number(eventRow.price))
                : t('admin.events.details.notPaid')
            }
          />
          {deadlineIso ? (
            <InfoTile
              icon="hourglass_top"
              label={t('admin.events.details.deadlineLabel')}
              value={dateFmt.format(new Date(deadlineIso))}
            />
          ) : null}
          {urgentSchedule ? (
            <InfoTile
              icon="event_repeat"
              label={t('admin.events.details.urgentScheduleLabel')}
              value={urgentSchedule}
            />
          ) : null}
        </div>

        {displayDescription(eventRow) ? (
          <p className="border-t border-outline-variant p-5 text-sm text-on-surface-variant">
            {displayDescription(eventRow)}
          </p>
        ) : null}
      </section>

      <AdminEventDetailsAttendanceSection
        event={eventRow}
        rows={attendanceQuery.data ?? []}
        isLoading={attendanceQuery.isPending}
        onRefresh={invalidateEvent}
        eventTitleForMessage={displayTitle(eventRow)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.events.details.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('admin.events.details.deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {t('admin.events.details.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.events.details.cancelTitle')}</DialogTitle>
            <DialogDescription>{t('admin.events.details.cancelDescription')}</DialogDescription>
          </DialogHeader>
          {eventRow.is_paid ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
              <Checkbox checked={refundOnCancel} onCheckedChange={(v) => setRefundOnCancel(v === true)} />
              {t('admin.events.details.refundCheckbox')}
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-error text-white hover:bg-error/90"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {t('admin.events.details.cancelConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
