import type { PillTone } from '@/lib/tones';

export type InvoiceType = 'monthly' | 'event' | 'extra_hours' | 'other';

/** The payment states shown in payment history (an invoice and the payments made on it). */
export type PaymentState = 'paid' | 'partial' | 'unpaid' | 'in_review' | 'overdue' | 'cancelled';

const TYPE_ICON: Record<InvoiceType, string> = {
  monthly: 'calendar_month',
  event: 'celebration',
  extra_hours: 'more_time',
  other: 'receipt_long',
};

/** One icon per invoice type, the same on every screen. Unknown types read as "other". */
export function invoiceTypeIcon(type: string): string {
  return TYPE_ICON[type as InvoiceType] ?? TYPE_ICON.other;
}

const PAYMENT_STATE: Record<PaymentState, { tone: PillTone; icon: string; labelKey: string }> = {
  paid: { tone: 'success', icon: 'task_alt', labelKey: 'invoice.status.paid' },
  partial: { tone: 'warning', icon: 'timelapse', labelKey: 'financial.paymentHistory.partial' },
  unpaid: { tone: 'neutral', icon: 'schedule', labelKey: 'invoice.status.pending' },
  in_review: { tone: 'primary', icon: 'hourglass_top', labelKey: 'invoice.inReview' },
  overdue: { tone: 'error', icon: 'error', labelKey: 'invoice.status.overdue' },
  cancelled: { tone: 'neutral', icon: 'block', labelKey: 'invoice.status.cancelled' },
};

/** Tone, icon and label key for a payment state. */
export function paymentStateUi(state: PaymentState) {
  return PAYMENT_STATE[state];
}

/** How much of an invoice is paid, as a whole percent from 0 to 100. */
export function paidShare(paidAmount: number, amount: number): number {
  if (!Number.isFinite(paidAmount) || !Number.isFinite(amount) || amount <= 0 || paidAmount <= 0) return 0;
  return Math.min(100, Math.round((paidAmount / amount) * 100));
}
