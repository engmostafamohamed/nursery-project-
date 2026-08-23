import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { EventQrCard } from '@/components/parent/EventQrCard';
import { ParentEventAttendeesSection } from '@/components/parent/ParentEventAttendeesSection';
import { ParentEventDetailsDialogs } from '@/components/parent/ParentEventDetailsDialogs';
import { ParentEventDetailsSections } from '@/components/parent/ParentEventDetailsSections';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  parentEventDetailsQueryKey,
  useParentEventDetails,
  type ParentEventDetailsPermission,
} from '@/hooks/useParentEventDetails';
import { parentPermissionsCountsQueryKey } from '@/hooks/useParentPermissionsPage';
import { generateEventInvoice, getInvoiceForPermission } from '@/lib/eventInvoices';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/lib/useSettings';

export function ParentEventDetailsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuthSession();
  const parentId = user?.id;
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  const detailQuery = useParentEventDetails(eventId, parentId);
  const data = detailQuery.data;
  const event = data?.event;
  const permissions = data?.permissions ?? [];

  const [denyTarget, setDenyTarget] = useState<ParentEventDetailsPermission | null>(null);
  const [denyNote, setDenyNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'deny' | null>(null);

  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  // NOTE: `weekday` cannot be combined with `dateStyle`/`timeStyle` in
  // Intl.DateTimeFormat — that throws "Invalid option". Use explicit components.
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  const displayEventTitle = () => {
    if (!event) return '';
    return (i18n.language.startsWith('ar') ? event.title_ar : event.title_en) || event.title_en || event.title_ar;
  };

  const displayChild = (p: ParentEventDetailsPermission) =>
    (i18n.language.startsWith('ar') ? p.childNameAr : p.childNameEn) || p.childNameEn || p.childNameAr;

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: parentEventDetailsQueryKey(eventId, parentId) });
    await queryClient.invalidateQueries({ queryKey: ['parent-event-permissions', parentId] });
    await queryClient.invalidateQueries({ queryKey: parentPermissionsCountsQueryKey(parentId) });
    await queryClient.invalidateQueries({ queryKey: ['parent-permissions-page', parentId] });
  };

  const runInvoiceAfterGrant = async (permissionId: string, childId: string) => {
    if (!parentId || !eventId || !event) return null;
    let invoice = await getInvoiceForPermission(permissionId);
    if (!invoice) {
      invoice = await generateEventInvoice({
        permissionId,
        eventId,
        childId,
        invoiceDueDays: Number(settings.invoice_due_days ?? 7),
      });
    }
    if (invoice) {
      await supabase.from('notifications').insert({
        user_id: parentId,
        type: 'event_invoice_generated',
        title_ar: 'تم إصدار فاتورة فعالية',
        title_en: 'Event invoice generated',
        body_ar: `تم إصدار فاتورة للفعالية ${event.title_ar}: ${invoice.amount} جنيه.`,
        body_en: `Invoice generated for ${event.title_en}: EGP ${invoice.amount}.`,
        channel: 'push',
      } as never);
    }
    return invoice;
  };

  const handleApprove = async (permissionId: string) => {
    if (!parentId) return;
    const row = permissions.find((p) => p.id === permissionId);
    if (!row) return;
    setBusyId(permissionId);
    setBusyAction('approve');
    try {
      const { error } = await supabase
        .from('permissions')
        .update({
          status: 'granted',
          responded_at: new Date().toISOString(),
          parent_note: null,
        } as never)
        .eq('id', permissionId);
      if (error) throw error;
      // The permission is granted now. Invoice generation is best-effort — if it
      // fails (e.g. a paid-event invoice insert), the approval must still show as
      // saved and the UI must refresh, not jump to the error path.
      let invoice: Awaited<ReturnType<typeof runInvoiceAfterGrant>> = null;
      try {
        invoice = await runInvoiceAfterGrant(permissionId, row.child_id);
      } catch (invErr) {
        console.error('event invoice generation failed (non-blocking)', invErr);
      }
      toast.success(t('parent.permissions.toastGranted', { title: displayEventTitle() }));
      await invalidateAll();
      if (event?.is_paid && invoice?.id) {
        navigate(`/parent/invoices?highlight=${encodeURIComponent(invoice.id)}`);
      }
    } catch {
      toast.error(t('parent.permissions.updateError'));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const confirmDeny = async () => {
    if (!denyTarget || !parentId) return;
    setBusyId(denyTarget.id);
    setBusyAction('deny');
    try {
      const note = denyNote.trim().slice(0, 200) || null;
      const { error } = await supabase
        .from('permissions')
        .update({
          status: 'denied',
          parent_note: note,
          responded_at: new Date().toISOString(),
        } as never)
        .eq('id', denyTarget.id);
      if (error) throw error;
      toast.success(t('parent.permissions.toastDenied', { title: displayEventTitle() }));
      setDenyTarget(null);
      setDenyNote('');
      await invalidateAll();
    } catch {
      toast.error(t('parent.permissions.updateError'));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('parent.events.details.shareSuccess'));
    } catch {
      toast.error(t('parent.events.details.shareError'));
    }
  };

  if (!eventId) {
    return (
      <div className="mx-auto max-w-4xl lg:max-w-none space-y-4 px-4 py-6">
        <p className="text-sm text-on-surface">{t('parent.events.details.notFound')}</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/parent/permissions">{t('parent.events.details.backToPermissions')}</Link>
        </Button>
      </div>
    );
  }

  if (!parentId) {
    return null;
  }

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl lg:max-w-none px-4 py-6" aria-busy="true">
        <LoadingSkeleton variant="default" />
        <span className="sr-only">{t('parent.events.details.loadingLabel')}</span>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl lg:max-w-none space-y-4 px-4 py-6">
        <p className="text-sm text-error" role="alert">
          {t('parent.events.details.loadError')}
        </p>
        <Button type="button" variant="outline" asChild>
          <Link to="/parent/permissions">{t('parent.events.details.backToPermissions')}</Link>
        </Button>
      </div>
    );
  }

  if (!data || !event) {
    return (
      <div className="mx-auto max-w-4xl lg:max-w-none space-y-4 px-4 py-6">
        <p className="text-sm text-on-surface">{t('parent.events.details.notFound')}</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/parent/permissions">{t('parent.events.details.backToPermissions')}</Link>
        </Button>
      </div>
    );
  }

  const deadlineMs = event.permission_deadline ? new Date(event.permission_deadline).getTime() : null;
  const deadlinePassed = deadlineMs !== null && deadlineMs < Date.now();
  const showDeadlineBanner = deadlinePassed && permissions.some((p) => p.status === 'pending');
  const isCancelled = Boolean(event.cancelled_at) || String(event.status).toLowerCase() === 'cancelled';

  return (
    <div className="mx-auto max-w-4xl lg:max-w-none space-y-4 px-4 pb-28 pt-4">
      <nav className="text-sm text-on-surface-variant" aria-label={t('parent.events.details.breadcrumbLabel')}>
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/parent/events" className="text-secondary hover:underline">
              {t('parent.events.details.breadcrumbEvents')}
            </Link>
          </li>
          <li className="material-symbols-outlined text-base rtl:rotate-180" aria-hidden>
            chevron_right
          </li>
          <li className="truncate font-medium text-on-surface">{displayEventTitle()}</li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('/parent/permissions')}>
          {t('parent.events.details.backToPermissions')}
        </Button>
      </div>

      {isCancelled ? (
        <div className="rounded-xl border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container" role="status">
          {t('parent.events.details.cancelledBanner')}
        </div>
      ) : null}

      {showDeadlineBanner ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning" role="status">
          {t('parent.events.details.deadlineExpired')}
        </div>
      ) : null}

      <ParentEventDetailsSections
        event={event}
        permissions={permissions}
        dateFmt={dateFmt}
        timeFmt={timeFmt}
        dateTimeFmt={dateTimeFmt}
        priceFmt={priceFmt}
        deadlinePassed={deadlinePassed}
        onShare={() => void handleShare()}
        onApprove={(id) => void handleApprove(id)}
        onDenyOpen={(p) => {
          setDenyNote('');
          setDenyTarget(p);
        }}
        busyId={busyId}
        busyAction={busyAction}
      />

      {!isCancelled && permissions.some((p) => p.status === 'granted') ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-on-surface">
            {t('parent.events.details.qr.sectionTitle')}
          </h2>
          {permissions
            .filter((p) => p.status === 'granted')
            .map((p) => (
              <EventQrCard
                key={p.id}
                eventId={event.id}
                childId={p.child_id}
                childName={displayChild(p)}
              />
            ))}
        </div>
      ) : null}

      <ParentEventAttendeesSection eventId={event.id} />

      <ParentEventDetailsDialogs
        denyTarget={denyTarget}
        onDenyDialogOpenChange={(open) => {
          if (!open) {
            setDenyTarget(null);
            setDenyNote('');
          }
        }}
        denyNote={denyNote}
        onDenyNoteChange={setDenyNote}
        busyId={busyId}
        onConfirmDeny={() => void confirmDeny()}
        onCloseDeny={() => {
          setDenyTarget(null);
          setDenyNote('');
        }}
        displayChild={displayChild}
        eventTitle={displayEventTitle()}
      />
    </div>
  );
}
