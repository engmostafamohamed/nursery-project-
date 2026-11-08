import { useTranslation } from 'react-i18next';

import { StatusPill, type PillTone } from '@/components/ui/DataTable';

import type { InvoiceState } from './parentBilling';

const LOOK: Record<InvoiceState, { tone: PillTone; icon: string }> = {
  paid: { tone: 'success', icon: 'check_circle' },
  in_review: { tone: 'warning', icon: 'hourglass_top' },
  overdue: { tone: 'error', icon: 'error' },
  due: { tone: 'primary', icon: 'schedule' },
  cancelled: { tone: 'neutral', icon: 'block' },
};

/** Paid, waiting for the nursery, late, due or cancelled: each with its own colour and icon. */
export function InvoiceStatusBadge({ state, className }: { state: InvoiceState; className?: string }) {
  const { t } = useTranslation();
  const look = LOOK[state];
  return (
    <StatusPill tone={look.tone} icon={look.icon} className={className}>
      {t(`parentBilling.state.${state}`)}
    </StatusPill>
  );
}
