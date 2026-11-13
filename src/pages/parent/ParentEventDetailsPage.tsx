import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { EventQrCard } from '@/components/parent/EventQrCard';
import { ParentEventAttendeesSection } from '@/components/parent/ParentEventAttendeesSection';
import { ParentEventDetailsDialogs } from '@/components/parent/ParentEventDetailsDialogs';
import { ParentEventDetailsPaymentBlock, ParentEventDetailsPermissionList } from '@/components/parent/ParentEventDetailsPermissionList';
import { ParentEventFacts } from '@/components/parent/ParentEventFacts';
import { Button } from '@/components/ui/button';
import { StatusPill, TableCard } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { eventFlowErrorKey, respondToEvent } from '@/features/events/eventFlowApi';
import { CATEGORY_ICON, categoryToneOf, eventTimeRange, STAGE_ICON, STAGE_TONE, type EventCategory } from '@/features/events/events';
import { FamilyEventNotice } from '@/features/events/FamilyEventNotice';
import { inferEventListStatus, type AdminEventsListRow } from '@/hooks/useAdminEventsList';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMoney } from '@/hooks/useMoney';
import { useParentEventDetails, type ParentEventDetailsPermission } from '@/hooks/useParentEventDetails';
import { localName } from '@/lib/bilingualName';
import { invalidateFamilyEventQueries } from '@/lib/eventCache';

/**
 * One event for a family: when and where, each child's answer (the main step), the payment of a
 * paid event, the check-in code of a child going, and who else goes. On a family's own urgent
 * event, no answer is asked; the family can take it back instead.
 */
export function ParentEventDetailsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuthSession();
  const parentId = user?.id;
  const queryClient = useQueryClient();
  const money = useMoney();
  const detailQuery = useParentEventDetails(eventId, parentId);
  const [denyTarget, setDenyTarget] = useState<ParentEventDetailsPermission | null>(null);
  const [denyNote, setDenyNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'deny' | null>(null);
  const [nowMs] = useState(Date.now);

  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const event = detailQuery.data?.event;
  const permissions = detailQuery.data?.permissions ?? [];
  const title = event ? localName(event.title_ar, event.title_en, isAr) : '';
  const displayChild = (p: ParentEventDetailsPermission) => localName(p.childNameAr, p.childNameEn, isAr);
  const refresh = () => invalidateFamilyEventQueries(queryClient);

  const answer = async (permission: ParentEventDetailsPermission, granted: boolean, note?: string) => {
    setBusyId(permission.id);
    setBusyAction(granted ? 'approve' : 'deny');
    try {
      const { invoice } = await respondToEvent({ permissionId: permission.id, granted, note });
      toast.success(t(granted ? 'parent.permissions.toastGranted' : 'parent.permissions.toastDenied', { title }));
      setDenyTarget(null);
      setDenyNote('');
      await refresh();
      if (invoice?.id) navigate(`/parent/invoices?highlight=${encodeURIComponent(invoice.id)}`);
    } catch (error) {
      toast.error(t(eventFlowErrorKey(error)));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('parent.events.details.shareSuccess'));
    } catch {
      toast.error(t('parent.events.details.shareError'));
    }
  };

  const backToEvents = (
    <Button asChild variant="outline">
      <Link to="/parent/events">
        <MaterialSymbol name="arrow_back" size="text-base" className="me-1 rtl:-scale-x-100" />
        {t('parent.events.details.breadcrumbEvents')}
      </Link>
    </Button>
  );

  if (!parentId) return null;
  if (detailQuery.isPending) {
    return (
      <div className="mx-auto max-w-5xl pb-28" aria-busy="true">
        <LoadingSkeleton />
        <span className="sr-only">{t('parent.events.details.loadingLabel')}</span>
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 pb-28">
        <LoadError message={t('parent.events.details.loadError')} onRetry={() => void detailQuery.refetch()} />
        {backToEvents}
      </div>
    );
  }
  if (!event) {
    return (
      <div className="mx-auto max-w-5xl pb-28">
        <EmptyState icon="event_busy" title={t('parent.events.details.notFound')} description="" action={backToEvents} />
      </div>
    );
  }

  const stage = inferEventListStatus(event as unknown as AdminEventsListRow);
  const cancelled = stage === 'cancelled';
  const open = event.status === 'active' && !event.cancelled_at;
  const ownEvent = Boolean(event.parent_created_by && event.parent_created_by === parentId);
  const deadlinePassed = Boolean(event.permission_deadline && new Date(event.permission_deadline).getTime() < nowMs);
  const pendingCount = permissions.filter((p) => p.status === 'pending').length;
  const going = permissions.filter((p) => p.status === 'granted');
  const price = event.is_paid && event.price ? Number(event.price) : 0;
  const category = event.category as EventCategory;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-28">
      <PageHeader
        icon="event"
        media={<EventDateBlock startsAt={event.starts_at} category={event.category} locale={locale} className="h-14" />}
        eyebrow={t('parent.events.details.breadcrumbEvents')}
        title={title}
        description={eventTimeRange(event.starts_at, event.ends_at, locale)}
        actions={
          <>
            {backToEvents}
            <Button type="button" variant="outline" onClick={() => void share()} aria-label={t('parent.events.details.ariaShare')}>
              <MaterialSymbol name="share" size="text-base" className="me-1" />
              {t('parent.events.details.share')}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {stage === 'cancelled' || stage === 'completed' ? (
            <StatusPill tone={STAGE_TONE[stage]} icon={STAGE_ICON[stage]}>{t(`parent.events.details.eventStatus.${stage}`)}</StatusPill>
          ) : null}
          {ownEvent ? <StatusPill tone="primary" icon="campaign">{t('familyEvent.yoursBadge')}</StatusPill> : null}
          {event.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('parent.events.urgentBadge')}</StatusPill> : null}
          <StatusPill tone={categoryToneOf(category)} icon={CATEGORY_ICON[category]}>{t(`admin.events.create.categories.${category}`, { defaultValue: category })}</StatusPill>
          {!ownEvent ? (
            <StatusPill tone={price > 0 ? 'success' : 'neutral'} icon={price > 0 ? 'payments' : 'money_off'}>
              {price > 0 ? money(price) : t('parent.events.details.free')}
            </StatusPill>
          ) : null}
        </div>
      </PageHeader>

      {cancelled ? (
        <p className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error" role="status">
          <MaterialSymbol name="event_busy" size="text-lg" className="shrink-0" />
          {t('parent.events.details.cancelledBanner')}
        </p>
      ) : deadlinePassed && pendingCount > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-on-surface" role="status">
          <MaterialSymbol name="hourglass_disabled" size="text-lg" className="shrink-0 text-warning" />
          {t('parent.events.details.deadlineExpired')}
        </p>
      ) : null}

      {ownEvent ? (
        <FamilyEventNotice
          eventId={event.id}
          eventTitle={title}
          childNames={permissions.map(displayChild).join(isAr ? '، ' : ', ')}
          canCancel={open && new Date(event.starts_at).getTime() > nowMs}
          onCancelled={() => void refresh()}
        />
      ) : (
        <TableCard
          title={t('parent.events.details.permissionSectionTitle')}
          count={pendingCount ? t('parent.events.details.awaitingCount', { count: pendingCount }) : undefined}
        >
          <ParentEventDetailsPermissionList
            event={event}
            permissions={permissions}
            money={money}
            deadlinePassed={deadlinePassed}
            actionsDisabled={!open}
            onApprove={(id) => {
              const permission = permissions.find((p) => p.id === id);
              if (permission) void answer(permission, true);
            }}
            onDenyOpen={(p) => {
              setDenyNote('');
              setDenyTarget(p);
            }}
            busyId={busyId}
            busyAction={busyAction}
          />
        </TableCard>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ParentEventFacts event={event} permissions={permissions} ownEvent={ownEvent} />
        <div className="space-y-5">
          {!ownEvent && price > 0 ? (
            <TableCard title={t('parent.events.details.paymentCardTitle')}>
              <ParentEventDetailsPaymentBlock event={event} permissions={permissions} money={money} />
            </TableCard>
          ) : null}
          {!cancelled && going.length ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-on-surface">{t('parent.events.details.qr.sectionTitle')}</h2>
              {going.map((p) => (
                <EventQrCard key={p.id} eventId={event.id} childId={p.child_id} childName={displayChild(p)} />
              ))}
            </section>
          ) : null}
          {!ownEvent ? <ParentEventAttendeesSection eventId={event.id} /> : null}
        </div>
      </div>

      <ParentEventDetailsDialogs
        denyTarget={denyTarget}
        onDenyDialogOpenChange={(isOpen) => {
          if (!isOpen) {
            setDenyTarget(null);
            setDenyNote('');
          }
        }}
        denyNote={denyNote}
        onDenyNoteChange={setDenyNote}
        busyId={busyId}
        onConfirmDeny={() => denyTarget && void answer(denyTarget, false, denyNote)}
        onCloseDeny={() => {
          setDenyTarget(null);
          setDenyNote('');
        }}
        displayChild={displayChild}
        eventTitle={title}
      />
    </div>
  );
}
