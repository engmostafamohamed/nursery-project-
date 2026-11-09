/*
 * The parent's bills, as plain data and rules (no React, no network), so every screen agrees and
 * the rules are tested on their own. The amounts come from get_parent_billing / get_parent_invoice,
 * which apply the same rules as the payment functions on the server.
 */

export type InvoiceType = 'monthly' | 'event' | 'extra_hours' | 'other' | 'food_extras';
export type InvoiceStatus = 'pending' | 'overdue' | 'paid' | 'cancelled';

export type BillingInvoice = {
  id: string;
  nurseryId: string;
  invoiceNumber: string;
  amount: number;
  type: InvoiceType;
  /** Overdue already worked out in the nursery's own calendar day. */
  status: InvoiceStatus;
  dueDate: string;
  createdAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  /** Stored line items, for descriptions and documents. */
  lineItems: unknown;
  /** Completed payments. */
  paidAmount: number;
  /** Payments sent and waiting for the nursery to confirm them. */
  pendingAmount: number;
  /** What can still be sent now: amount - paid - in review (0 once paid or cancelled). */
  payable: number;
  overdueDays: number;
  /** Set for an admission invoice: it is paid in one payment of everything due. */
  applicationId: string | null;
  childIds: string[];
};

/** How an invoice reads to the parent: what they must do, or that nothing is left to do. */
export type InvoiceState = 'paid' | 'cancelled' | 'in_review' | 'overdue' | 'due';

export function invoiceState(invoice: Pick<BillingInvoice, 'status' | 'payable' | 'pendingAmount'>): InvoiceState {
  if (invoice.status === 'paid') return 'paid';
  if (invoice.status === 'cancelled') return 'cancelled';
  // Everything left is with the nursery: nothing to pay, only to wait for.
  if (invoice.payable <= 0 && invoice.pendingAmount > 0) return 'in_review';
  return invoice.status === 'overdue' ? 'overdue' : 'due';
}

/** Something is still to be paid on it now. */
export const isPayable = (invoice: Pick<BillingInvoice, 'status' | 'payable'>) =>
  (invoice.status === 'pending' || invoice.status === 'overdue') && invoice.payable > 0;

const byDueDate = (a: BillingInvoice, b: BillingInvoice) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt);
const round2 = (n: number) => Math.round(n * 100) / 100;

export type BillingSummary = {
  /** Still to send, across every open invoice. */
  owed: number;
  owedCount: number;
  /** The overdue part of it. */
  overdue: number;
  overdueCount: number;
  /** Sent and waiting for the nursery. */
  inReview: number;
  inReviewCount: number;
  /** The open invoice due soonest (the oldest overdue one when some are late). */
  next: BillingInvoice | null;
  paidCount: number;
};

export function billingSummary(invoices: BillingInvoice[]): BillingSummary {
  const payable = invoices.filter(isPayable).sort(byDueDate);
  const overdue = payable.filter((i) => i.status === 'overdue');
  const reviewing = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled' && i.pendingAmount > 0);
  return {
    owed: round2(payable.reduce((sum, i) => sum + i.payable, 0)),
    owedCount: payable.length,
    overdue: round2(overdue.reduce((sum, i) => sum + i.payable, 0)),
    overdueCount: overdue.length,
    inReview: round2(reviewing.reduce((sum, i) => sum + i.pendingAmount, 0)),
    inReviewCount: reviewing.length,
    next: payable[0] ?? null,
    paidCount: invoices.filter((i) => i.status === 'paid').length,
  };
}

/** An admission invoice is paid in one payment of everything due; others may be paid in parts. */
export const amountPolicyOf = (invoice: Pick<BillingInvoice, 'applicationId'>): 'full' | 'flexible' =>
  invoice.applicationId ? 'full' : 'flexible';

export type PartAmountError = 'required' | 'invalid' | 'too_small' | 'too_large';

/** What is wrong with a part payment the parent typed, or null when it can be sent. */
export function partAmountError(text: string, payable: number): PartAmountError | null {
  const trimmed = text.trim();
  if (!trimmed) return 'required';
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 'invalid';
  const amount = Number(trimmed);
  if (amount <= 0) return 'too_small';
  if (amount > payable + 0.005) return 'too_large';
  return null;
}

export type LoyaltyOffer = {
  enabled: boolean;
  /** EGP per point. */
  rate: number;
  balance: number;
  minPoints: number;
  /** The most the next redemption may take off this invoice. */
  maxDiscount: number;
};

export type PointsLimits = { usable: boolean; minPoints: number; maxPoints: number; rate: number };

/** How many points the parent can use on this invoice now (the server checks the same limits). */
export function pointsLimits(loyalty: LoyaltyOffer | null): PointsLimits {
  if (!loyalty || !loyalty.enabled || loyalty.rate <= 0) return { usable: false, minPoints: 0, maxPoints: 0, rate: 0 };
  // A discount is rounded to piastres on the server, so the points stay within the cap.
  const maxPoints = Math.max(0, Math.min(loyalty.balance, Math.floor((loyalty.maxDiscount + 1e-9) / loyalty.rate)));
  return { usable: maxPoints >= loyalty.minPoints, minPoints: loyalty.minPoints, maxPoints, rate: loyalty.rate };
}

export type PointsError = 'whole_number' | 'below_minimum' | 'above_maximum';

export function pointsError(points: number, limits: PointsLimits): PointsError | null {
  if (!Number.isInteger(points)) return 'whole_number';
  if (points < limits.minPoints) return 'below_minimum';
  if (points > limits.maxPoints) return 'above_maximum';
  return null;
}

export const pointsDiscount = (points: number, rate: number) => round2(points * rate);

/** The steps of paying, in order; points only when the parent can use some on this invoice. */
export type PayStep = 'amount' | 'points' | 'method' | 'confirm';

export function payFlowSteps(canUsePoints: boolean): PayStep[] {
  return canUsePoints ? ['amount', 'points', 'method', 'confirm'] : ['amount', 'method', 'confirm'];
}

/** A child's name in the reader's language, falling back to the other one. */
export function localName(names: { name_ar?: string | null; name_en?: string | null }, isArabic: boolean): string {
  const ar = names.name_ar?.trim() ?? '';
  const en = names.name_en?.trim() ?? '';
  return (isArabic ? ar || en : en || ar) || '';
}
