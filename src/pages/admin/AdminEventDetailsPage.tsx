import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { AdminEventDetailsAttendanceSection } from '@/components/admin/AdminEventDetailsAttendanceSection';
import { EventDateBlock } from '@/components/events/EventDateBlock';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { CATEGORY_ICON, categoryToneOf, eventTimeRange, SCOPE_ICON, STAGE_ICON, STAGE_TONE, type EventCategory, type EventScope, type EventStage } from '@/features/events/events';
import { UnbilledApprovalsNotice } from '@/features/events/UnbilledApprovalsNotice';
import { useEventActions } from '@/features/events/useEventActions';
import { useAdminEventAttendance, useAdminEventDetail } from '@/hooks/useAdminEventDetails';
import { inferEventListStatus, type AdminEventsListRow } from '@/hooks/useAdminEventsList';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMoney } from '@/hooks/useMoney';
import { useCanAction } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localName } from '@/lib/bilingualName';
import { invalidateAllEventQueries } from '@/lib/eventCache';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { cn } from '@/lib/utils';

/** One fact about the event: an icon tile, a label and the value. */
function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface p-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_TINT.primary)}>
        <MaterialSymbol name={icon} size="text-lg" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-on-surface-variant">{label}</p>
        <p className="break-words text-sm font-medium text-on-surface">{value}</p>
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
  const listPath = `/admin/events${qs}`;
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const money = useMoney();
  const can = {
    create: useCanAction('event_calendar', 'create'),
    update: useCanAction('event_calendar', 'update'),
    delete: useCanAction('event_calendar', 'delete'),
  };

  const eventQuery = useAdminEventDetail(eventId, nurseryId);
  const attendanceQuery = useAdminEventAttendance(eventId, nurseryId);
  const actions = useEventActions(nurseryId, { qs, onDeleted: () => navigate(listPath) });
  const row = eventQuery.data;

  const backButton = (
    <Button asChild variant="outline">
      <Link to={listPath}>{t('admin.events.edit.backToList')}</Link>
    </Button>
  );

  if (Boolean(user) && (profileQuery.isPending || (Boolean(nurseryId) && eventQuery.isPending))) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 pb-8">
        <LoadingSkeleton />
      </div>
    );
  }
  if (!nurseryId || !eventId || eventQuery.isError || !row) {
    const message = !nurseryId
      ? t('admin.events.list.noNurseryDescription')
      : eventQuery.isError
        ? t('admin.events.details.loadError')
        : t('admin.events.details.notFound');
    return (
      <div className="mx-auto max-w-5xl space-y-3 pb-8">
        <p className="text-sm text-error" role="alert">{message}</p>
        {backButton}
      </div>
    );
  }

  const title = localName(row.title_ar, row.title_en, isAr);
  const description = localName(row.description_ar, row.description_en, isAr);
  const stage = inferEventListStatus(row as unknown as AdminEventsListRow) as EventStage;
  const category = row.category as EventCategory;
  const tone = categoryToneOf(category);
  const price = row.is_paid ? Number(row.price ?? 0) : 0;
  const urgent = summarizeUrgentSchedule(row, t);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  const target = { id: row.id, title };
  const open = stage === 'draft' || stage === 'active';

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <PageHeader
        icon="event"
        media={<EventDateBlock startsAt={row.starts_at} category={category} locale={locale} className="h-14" />}
        eyebrow={t('admin.events.details.breadcrumbEvents')}
        title={title}
        description={eventTimeRange(row.starts_at, row.ends_at, locale)}
        actions={
          <>
            {backButton}
            {can.update && open ? (
              <Button asChild variant="outline">
                <Link to={`/admin/events/${row.id}/edit${qs}`}>
                  <MaterialSymbol name="edit" size="text-base" className="me-1" />
                  {t('admin.events.actions.edit')}
                </Link>
              </Button>
            ) : null}
            {can.create ? (
              <Button type="button" variant="outline" disabled={actions.busy} onClick={() => void actions.duplicate(target)}>
                <MaterialSymbol name="content_copy" size="text-base" className="me-1" />
                {t('admin.events.list.actions.duplicate')}
              </Button>
            ) : null}
            {can.update && stage === 'draft' ? (
              <Button type="button" disabled={actions.busy} onClick={() => void actions.publish(target)} data-testid="event-details-publish">
                <MaterialSymbol name="send" size="text-base" className="me-1 rtl:rotate-180" />
                {t('admin.events.create.publish')}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={STAGE_TONE[stage]} icon={STAGE_ICON[stage]}>{t(`admin.events.list.statusBadge.${stage}`)}</StatusPill>
          <StatusPill tone={tone} icon={CATEGORY_ICON[category]}>{t(`admin.events.create.categories.${category}`)}</StatusPill>
          {row.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('admin.events.list.urgentBadge')}</StatusPill> : null}
          <StatusPill icon={SCOPE_ICON[row.target_scope as EventScope] ?? 'groups'}>{t(`admin.events.list.scope.${row.target_scope}`)}</StatusPill>
          <StatusPill tone={price > 0 ? 'success' : 'neutral'} icon={price > 0 ? 'payments' : 'money_off'}>
            {price > 0 ? money(price) : t('admin.events.details.notPaid')}
          </StatusPill>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoTile icon="schedule" label={t('admin.events.details.whenLabel')} value={eventTimeRange(row.starts_at, row.ends_at, locale)} />
          <InfoTile icon="location_on" label={t('admin.events.details.whereLabel')} value={row.location || '—'} />
          {row.target_scope === 'class' ? (
            <InfoTile icon="school" label={t('admin.events.details.className')} value={localName(row.classNameAr, row.classNameEn, isAr) || '—'} />
          ) : null}
          {row.permission_deadline ? (
            <InfoTile icon="hourglass_top" label={t('admin.events.details.deadlineLabel')} value={dateTime.format(new Date(row.permission_deadline))} />
          ) : null}
          {urgent ? <InfoTile icon="event_repeat" label={t('admin.events.details.urgentScheduleLabel')} value={urgent} /> : null}
          {row.cancelled_at ? <InfoTile icon="event_busy" label={t('eventForm.cancelledOn')} value={dateTime.format(new Date(row.cancelled_at))} /> : null}
        </div>
        {/* The replies are counted in the attendance section below (one place for them). */}
        {stage === 'draft' ? (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <MaterialSymbol name="info" size="text-base" />
            {t('eventForm.notSentYet')}
          </p>
        ) : null}
        {description ? <p className="whitespace-pre-line text-sm text-on-surface-variant">{description}</p> : null}
      </PageHeader>

      {can.update && price > 0 && (stage === 'active' || stage === 'completed') ? (
        <UnbilledApprovalsNotice
          eventId={row.id}
          count={(attendanceQuery.data ?? []).filter((r) => r.status === 'granted' && (!r.invoice_status || r.invoice_status === 'cancelled')).length}
          onBilled={() => void invalidateAllEventQueries(queryClient)}
        />
      ) : null}

      <AdminEventDetailsAttendanceSection
        event={row}
        rows={attendanceQuery.data ?? []}
        isLoading={attendanceQuery.isPending}
        onRefresh={() => invalidateAllEventQueries(queryClient)}
        eventTitleForMessage={title}
      />

      {(can.update && stage === 'active') || (can.delete && (stage === 'draft' || stage === 'cancelled')) ? (
        <section className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-on-surface">
            <MaterialSymbol name="warning" size="text-lg" className="shrink-0 text-error" />
            {stage === 'active' ? t('eventFlow.cancel.zoneHint') : t('eventForm.deleteHint')}
          </p>
          {stage === 'active' ? (
            <Button type="button" variant="outline" className="shrink-0 border-error/40 text-error hover:bg-error/10" onClick={() => actions.cancel(target)} data-testid="event-details-cancel">
              <MaterialSymbol name="event_busy" size="text-base" className="me-1" />
              {t('admin.events.details.cancelEvent')}
            </Button>
          ) : (
            <Button type="button" variant="outline" className="shrink-0 border-error/40 text-error hover:bg-error/10" disabled={actions.busy} onClick={() => void actions.remove(target)}>
              <MaterialSymbol name="delete" size="text-base" className="me-1" />
              {t('admin.events.details.delete')}
            </Button>
          )}
        </section>
      ) : null}

      {actions.dialog}
    </div>
  );
}
