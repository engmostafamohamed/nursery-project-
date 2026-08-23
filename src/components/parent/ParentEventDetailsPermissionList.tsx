import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ParentEventDetailsEvent, ParentEventDetailsPermission } from '@/hooks/useParentEventDetails';
import { getUserInitials } from '@/lib/utils';

export function ParentEventDetailsPermissionList({
  event,
  permissions,
  dateTimeFmt,
  priceFmt,
  deadlinePassed,
  actionsDisabled,
  onApprove,
  onDenyOpen,
  busyId,
  busyAction,
}: {
  event: ParentEventDetailsEvent;
  permissions: ParentEventDetailsPermission[];
  dateTimeFmt: Intl.DateTimeFormat;
  priceFmt: Intl.NumberFormat;
  deadlinePassed: boolean;
  actionsDisabled: boolean;
  onApprove: (permissionId: string) => void;
  onDenyOpen: (p: ParentEventDetailsPermission) => void;
  busyId: string | null;
  busyAction: 'approve' | 'deny' | null;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');

  // Single-click approve. For paid events surface the price on the button so the
  // charge is clear before the (now single) click.
  const priceNum = event.price != null && event.price !== '' ? Number(event.price) : 0;
  const approveLabel =
    event.is_paid && priceNum > 0
      ? `${t('parent.events.details.approve')} · ${priceFmt.format(priceNum)}`
      : t('parent.events.details.approve');

  const sorted = useMemo(
    () =>
      [...permissions].sort((a, b) =>
        (isAr ? a.childNameAr : a.childNameEn).localeCompare(isAr ? b.childNameAr : b.childNameEn, isAr ? 'ar' : 'en'),
      ),
    [permissions, isAr],
  );

  if (permissions.length === 0) {
    if (String(event.status).toLowerCase() === 'draft') {
      return <p className="text-sm text-on-surface-variant">{t('parent.events.details.noPermissionDraft')}</p>;
    }
    return <p className="text-sm text-on-surface-variant">{t('parent.events.details.noPermissionNotRequired')}</p>;
  }

  return (
    <ul className="space-y-4">
      {sorted.map((p) => {
        const childName = (isAr ? p.childNameAr : p.childNameEn) || p.childNameEn || p.childNameAr;
        const pending = p.status === 'pending';
        const granted = p.status === 'granted';
        const denied = p.status === 'denied';
        const busy = busyId === p.id;
        const approveDisabled = pending && (deadlinePassed || actionsDisabled);

        return (
          <li key={p.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <div className="flex gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={childName} /> : null}
                <AvatarFallback>{getUserInitials(childName, null)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">{childName}</p>
                  <Badge
                    className={
                      pending
                        ? 'border-warning/40 bg-warning/10 text-warning'
                        : granted
                          ? 'border-success/40 bg-success/10 text-success'
                          : 'border-error/40 bg-error/10 text-error'
                    }
                  >
                    {t(`parent.events.details.permissionStatus.${p.status}`, { defaultValue: p.status })}
                  </Badge>
                </div>
                {granted && p.responded_at ? (
                  <p className="text-xs text-on-surface-variant">
                    {t('parent.events.details.approvedOn', {
                      date: dateTimeFmt.format(new Date(p.responded_at)),
                    })}
                  </p>
                ) : null}
                {denied && p.responded_at ? (
                  <p className="text-xs text-on-surface-variant">
                    {t('parent.events.details.declinedOn', {
                      date: dateTimeFmt.format(new Date(p.responded_at)),
                    })}
                  </p>
                ) : null}
                {denied && p.parent_note ? (
                  <p className="text-xs text-on-surface-variant">
                    {t('parent.events.details.yourNote')}: {p.parent_note}
                  </p>
                ) : null}
                {pending ? (
                  <div className="flex w-full flex-col gap-2">
                    <Button
                      type="button"
                      size="lg"
                      className="w-full gap-2 bg-success text-white hover:bg-success/90"
                      disabled={busy || approveDisabled}
                      aria-busy={busy && busyAction === 'approve'}
                      onClick={() => onApprove(p.id)}
                    >
                      {busy && busyAction === 'approve' ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-xl" aria-hidden>
                            progress_activity
                          </span>
                          {t('parent.events.details.approving')}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-xl" aria-hidden>
                            check_circle
                          </span>
                          {approveLabel}
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full gap-2 border-error text-error hover:bg-error-container"
                      disabled={busy || actionsDisabled}
                      aria-busy={busy && busyAction === 'deny'}
                      onClick={() => onDenyOpen(p)}
                    >
                      {busy && busyAction === 'deny' ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-xl" aria-hidden>
                            progress_activity
                          </span>
                          {t('parent.events.details.denying')}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-xl" aria-hidden>
                            cancel
                          </span>
                          {t('parent.events.details.deny')}
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
                {granted || denied ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={busy || actionsDisabled}
                    onClick={() => (granted ? onDenyOpen(p) : onApprove(p.id))}
                  >
                    {t('parent.events.details.changeResponse')}
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ParentEventDetailsPaymentBlock({
  event,
  permissions,
  priceFmt,
}: {
  event: ParentEventDetailsEvent;
  permissions: ParentEventDetailsPermission[];
  priceFmt: Intl.NumberFormat;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const priceNum = event.price != null && event.price !== '' ? Number(event.price) : 0;
  const granted = permissions.filter((p) => p.status === 'granted');
  const grantedCount = granted.length;
  const totalRevenue = priceNum > 0 ? priceNum * grantedCount : 0;

  return (
    <div className="space-y-3 text-sm">
      <p>{t('parent.events.details.pricePerChild', { amount: priceFmt.format(priceNum) })}</p>
      {grantedCount > 1 ? (
        <p className="font-medium text-on-surface">
          {t('parent.events.details.totalApproved', {
            total: priceFmt.format(totalRevenue),
            count: grantedCount,
          })}
        </p>
      ) : null}
      <ul className="space-y-2">
        {granted.map((p) => {
          const childName = (isAr ? p.childNameAr : p.childNameEn) || p.childNameEn || p.childNameAr;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant p-2">
              <span className="text-on-surface">{childName}</span>
              {p.invoice ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-outline-variant bg-surface-container text-on-surface">
                    {t(`parent.events.details.invoiceStatus.${p.invoice.status}`, {
                      defaultValue: p.invoice.status,
                    })}
                  </Badge>
                  <Link
                    to={`/parent/invoices/${p.invoice.id}`}
                    className="text-sm font-medium text-secondary underline underline-offset-2"
                  >
                    {t('parent.events.details.viewInvoice')}
                  </Link>
                </div>
              ) : (
                <span className="text-xs text-on-surface-variant">{t('parent.events.details.noInvoiceYet')}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-on-surface-variant">{t('parent.events.details.paymentInstructions')}</p>
    </div>
  );
}
