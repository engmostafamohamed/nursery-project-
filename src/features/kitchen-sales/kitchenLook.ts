import { useTranslation } from 'react-i18next';

import { formatMoneyAmount } from '@/lib/money';
import type { PillTone } from '@/lib/tones';

import type { ChargeBilling, ExtraKind, RequestStatus } from './kitchenSales';

/** One look per state and kind, the same on every kitchen screen. */
export const BILLING_LOOK: Record<ChargeBilling, { tone: PillTone; icon: string }> = {
  open: { tone: 'warning', icon: 'schedule' },
  deducted: { tone: 'success', icon: 'payments' },
  invoiced: { tone: 'primary', icon: 'receipt_long' },
  paid: { tone: 'success', icon: 'task_alt' },
  no_parent: { tone: 'error', icon: 'person_off' },
  cancelled: { tone: 'neutral', icon: 'block' },
};

export const REQUEST_LOOK: Record<RequestStatus, { tone: PillTone; icon: string }> = {
  waiting_parent: { tone: 'warning', icon: 'hourglass_top' },
  approved: { tone: 'primary', icon: 'thumb_up' },
  declined: { tone: 'neutral', icon: 'thumb_down' },
  served: { tone: 'success', icon: 'restaurant' },
  cancelled: { tone: 'neutral', icon: 'block' },
  expired: { tone: 'neutral', icon: 'event_busy' },
};

export const EXTRA_ICON: Record<ExtraKind, string> = { meal: 'lunch_dining', drink: 'local_cafe', snack: 'cookie' };

/** An amount in the nursery's money, as the rest of the app writes it ("EGP 1,250"). */
export function useMoney() {
  const { t } = useTranslation();
  return (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
}

/** A fresh key so a taking sent twice (a double tap, a retry) is charged once. */
export const newTakingKey = () => crypto.randomUUID();
