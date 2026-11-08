import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { InvoiceStatusBadge } from '../InvoiceStatusBadge';
import type { InvoiceState } from '../parentBilling';

type Kind = 'sent' | 'already_sent' | 'paid_with_points' | 'paid' | 'cancelled' | 'waiting';

const LOOK: Record<Kind, { icon: string; tone: string; state: InvoiceState }> = {
  sent: { icon: 'hourglass_top', tone: 'bg-warning/10 text-warning', state: 'in_review' },
  already_sent: { icon: 'hourglass_top', tone: 'bg-warning/10 text-warning', state: 'in_review' },
  waiting: { icon: 'hourglass_top', tone: 'bg-warning/10 text-warning', state: 'in_review' },
  paid_with_points: { icon: 'check_circle', tone: 'bg-success/10 text-success', state: 'paid' },
  paid: { icon: 'check_circle', tone: 'bg-success/10 text-success', state: 'paid' },
  cancelled: { icon: 'block', tone: 'bg-surface-high text-on-surface-variant', state: 'cancelled' },
};

/**
 * Where paying ends, or why there is nothing to pay: sent and waiting for the nursery (it notifies
 * the parent when it confirms), paid, or cancelled.
 */
export function PayOutcome({ kind, invoiceId, extra }: { kind: Kind; invoiceId: string; extra?: ReactNode }) {
  const { t } = useTranslation();
  const look = LOOK[kind];
  return (
    <div role="status" className="space-y-4 text-center" data-testid={`pay-outcome-${kind}`}>
      <span className={cn('mx-auto flex h-14 w-14 items-center justify-center rounded-full', look.tone)}>
        <MaterialSymbol name={look.icon} size="text-3xl" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-on-surface">{t(`parentBilling.outcome.${kind}.title`)}</h2>
        <p className="text-sm text-on-surface-variant">{t(`parentBilling.outcome.${kind}.body`)}</p>
      </div>
      <InvoiceStatusBadge state={look.state} className="mx-auto" />
      {extra}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild>
          <Link to="/parent/invoices">{t('parentBilling.outcome.backToInvoices')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={`/parent/invoices/${invoiceId}`}>{t('parentBilling.outcome.viewInvoice')}</Link>
        </Button>
      </div>
    </div>
  );
}
