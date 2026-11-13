import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StatusPill, type PillTone } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ParentEventDetailsEvent, ParentEventDetailsPermission } from '@/hooks/useParentEventDetails';
import { localName } from '@/lib/bilingualName';
import { getUserInitials } from '@/lib/utils';

const ANSWER: Record<string, { tone: PillTone; icon: string }> = {
  pending: { tone: 'warning', icon: 'pending_actions' },
  granted: { tone: 'success', icon: 'task_alt' },
  denied: { tone: 'error', icon: 'block' },
};
const INVOICE_TONE: Record<string, PillTone> = { paid: 'success', pending: 'warning', overdue: 'error', cancelled: 'neutral' };

const priceOf = (event: ParentEventDetailsEvent) => (event.is_paid && event.price != null && event.price !== '' ? Number(event.price) : 0);

/**
 * The family's answer for each of its children: yes (with the price of a paid event on the button)
 * or no (with a note), and a change of mind while the event is open.
 */
export function ParentEventDetailsPermissionList({
  event,
  permissions,
  money,
  deadlinePassed,
  actionsDisabled,
  onApprove,
  onDenyOpen,
  busyId,
  busyAction,
}: {
  event: ParentEventDetailsEvent;
  permissions: ParentEventDetailsPermission[];
  money: (amount: number) => string;
  deadlinePassed: boolean;
  actionsDisabled: boolean;
  onApprove: (permissionId: string) => void;
  onDenyOpen: (p: ParentEventDetailsPermission) => void;
  busyId: string | null;
  busyAction: 'approve' | 'deny' | null;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const respondedFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  const price = priceOf(event);
  const approveLabel = price > 0 ? `${t('parent.events.details.approve')} · ${money(price)}` : t('parent.events.details.approve');
  const sorted = useMemo(
    () => [...permissions].sort((a, b) => localName(a.childNameAr, a.childNameEn, isAr).localeCompare(localName(b.childNameAr, b.childNameEn, isAr), locale)),
    [permissions, isAr, locale],
  );

  if (permissions.length === 0) {
    return <p className="p-4 text-sm text-on-surface-variant sm:p-5">{t('parent.events.details.noPermissionNotRequired')}</p>;
  }

  return (
    <ul className="divide-y divide-outline-variant">
      {sorted.map((p) => {
        const childName = localName(p.childNameAr, p.childNameEn, isAr);
        const pending = p.status === 'pending';
        const busy = busyId === p.id;
        const answer = ANSWER[p.status] ?? ANSWER.pending;
        return (
          <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5" data-testid="event-answer">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                {p.avatar_url ? <AvatarImage src={p.avatar_url} alt="" /> : null}
                <AvatarFallback>{getUserInitials(childName, null)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold text-on-surface">{childName}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={answer.tone} icon={answer.icon}>
                    {t(`parent.events.details.permissionStatus.${p.status}`, { defaultValue: p.status })}
                  </StatusPill>
                  {!pending && p.responded_at ? (
                    <span className="text-xs text-on-surface-variant">{respondedFmt.format(new Date(p.responded_at))}</span>
                  ) : null}
                </div>
                {p.status === 'denied' && p.parent_note ? (
                  <p className="text-xs text-on-surface-variant">
                    {t('parent.events.details.yourNote')}: {p.parent_note}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {pending ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 gap-1.5 bg-success text-white hover:bg-success/90 sm:flex-none"
                    disabled={busy || deadlinePassed || actionsDisabled}
                    aria-busy={busy && busyAction === 'approve'}
                    onClick={() => onApprove(p.id)}
                    data-testid="event-answer-yes"
                  >
                    <MaterialSymbol name={busy && busyAction === 'approve' ? 'progress_activity' : 'check_circle'} size="text-lg" className={busy && busyAction === 'approve' ? 'animate-spin' : undefined} />
                    {busy && busyAction === 'approve' ? t('parent.events.details.approving') : approveLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-1.5 border-error/40 text-error hover:bg-error/10 sm:flex-none"
                    disabled={busy || actionsDisabled}
                    aria-busy={busy && busyAction === 'deny'}
                    onClick={() => onDenyOpen(p)}
                  >
                    <MaterialSymbol name="cancel" size="text-lg" />
                    {busy && busyAction === 'deny' ? t('parent.events.details.denying') : t('parent.events.details.deny')}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || actionsDisabled}
                  onClick={() => (p.status === 'granted' ? onDenyOpen(p) : onApprove(p.id))}
                >
                  <MaterialSymbol name="swap_horiz" size="text-base" className="me-1" />
                  {t('parent.events.details.changeResponse')}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A paid event: the price per child, and each child's invoice once the family said yes. */
export function ParentEventDetailsPaymentBlock({
  event,
  permissions,
  money,
}: {
  event: ParentEventDetailsEvent;
  permissions: ParentEventDetailsPermission[];
  money: (amount: number) => string;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const price = priceOf(event);
  const granted = permissions.filter((p) => p.status === 'granted');

  return (
    <div className="space-y-3 p-4 text-sm sm:p-5">
      <p className="text-on-surface">{t('parent.events.details.pricePerChild', { amount: money(price) })}</p>
      {granted.length > 1 ? (
        <p className="font-medium text-on-surface">{t('parent.events.details.totalApproved', { total: money(price * granted.length), count: granted.length })}</p>
      ) : null}
      {granted.length ? (
        <ul className="divide-y divide-outline-variant rounded-lg border border-outline-variant">
          {granted.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-on-surface">{localName(p.childNameAr, p.childNameEn, isAr)}</span>
              {p.invoice ? (
                <span className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={INVOICE_TONE[p.invoice.status] ?? 'neutral'}>
                    {t(`parent.events.details.invoiceStatus.${p.invoice.status}`, { defaultValue: p.invoice.status })}
                  </StatusPill>
                  <Link to={`/parent/invoices/${p.invoice.id}`} className="text-sm font-medium text-primary underline underline-offset-2">
                    {t('parent.events.details.viewInvoice')}
                  </Link>
                </span>
              ) : (
                <span className="text-xs text-on-surface-variant">{t('parent.events.details.noInvoiceYet')}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-on-surface-variant">{t('parent.events.details.paymentInstructions')}</p>
    </div>
  );
}
