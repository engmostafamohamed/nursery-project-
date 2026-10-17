/**
 * Figures for a family's (or one child's) financial history, shared by the parent payment record
 * and the admin child billing tab: what was invoiced, what was actually paid, what is still owed,
 * and the state of every late-pickup (extra hours) day.
 */

export type FinanceInvoice = {
  amount: number;
  /** Completed payments on the invoice. */
  paidAmount: number;
  /** Still owed (0 once paid or cancelled). */
  balance: number;
  /** A payment the parent submitted is waiting for finance. */
  inReview: boolean;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  type: string;
  childIds: string[];
};

export type MoneySummary = {
  invoiceCount: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  inReviewCount: number;
};

export const EMPTY_SUMMARY: MoneySummary = { invoiceCount: 0, invoiced: 0, paid: 0, outstanding: 0, inReviewCount: 0 };

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * What an invoice contributes as paid. Older invoices were marked paid without a payment row, so a
 * paid invoice counts in full even when no payment was recorded against it.
 */
export function paidPortion(invoice: Pick<FinanceInvoice, 'amount' | 'paidAmount' | 'status'>): number {
  if (invoice.status === 'cancelled') return 0;
  return invoice.status === 'paid' ? Math.max(invoice.paidAmount, invoice.amount) : invoice.paidAmount;
}

/** Totals over invoices; cancelled ones are left out. `share` scales each invoice (per-child split). */
export function summarizeInvoices<T extends FinanceInvoice>(rows: T[], share: (row: T) => number = () => 1): MoneySummary {
  const summary = { ...EMPTY_SUMMARY };
  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    const part = share(row);
    summary.invoiceCount += 1;
    summary.invoiced += row.amount * part;
    summary.paid += paidPortion(row) * part;
    summary.outstanding += row.balance * part;
    if (row.inReview) summary.inReviewCount += 1;
  }
  return {
    ...summary,
    invoiced: round2(summary.invoiced),
    paid: round2(summary.paid),
    outstanding: round2(summary.outstanding),
  };
}

/** Key for invoices not linked to any child (older invoices, family-wide charges). */
export const FAMILY_BUCKET = '';

/**
 * Totals per child. An invoice for several children (e.g. an event) is split evenly between them;
 * one linked to no child goes to FAMILY_BUCKET.
 */
export function summarizeByChild<T extends FinanceInvoice>(rows: T[]): Map<string, MoneySummary> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const keys = row.childIds.length ? row.childIds : [FAMILY_BUCKET];
    for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const result = new Map<string, MoneySummary>();
  for (const [key, list] of groups) {
    result.set(key, summarizeInvoices(list, (row) => 1 / Math.max(row.childIds.length, 1)));
  }
  return result;
}

/** Totals per invoice type (monthly, event, extra_hours, other). */
export function summarizeByType<T extends FinanceInvoice>(rows: T[], share: (row: T) => number = () => 1): Map<string, MoneySummary> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(row.type, [...(groups.get(row.type) ?? []), row]);
  return new Map([...groups].map(([type, list]) => [type, summarizeInvoices(list, share)]));
}

// ---------------------------------------------------------------------------------------------
// Extra hours (late pickup)
// ---------------------------------------------------------------------------------------------

/**
 * - covered: the extra-hours package covered all of it, nothing to pay.
 * - no_charge: late, but nothing was charged (within grace, or waived).
 * - not_invoiced: a fee was recorded but never put on an invoice (days before late billing ran).
 * - unpaid / in_review / paid / cancelled: the state of the invoice carrying the fee.
 */
export type ExtraHoursDayStatus = 'covered' | 'no_charge' | 'not_invoiced' | 'unpaid' | 'in_review' | 'paid' | 'cancelled';

export type ExtraHoursDay = {
  attendanceId: string;
  childId: string;
  date: string;
  hours: number;
  coveredHours: number;
  billedHours: number;
  fee: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  status: ExtraHoursDayStatus;
};

export function extraHoursDayStatus(input: {
  fee: number;
  coveredHours: number;
  invoiceId: string | null;
  invoiceStatus: string | null;
  inReview: boolean;
}): ExtraHoursDayStatus {
  if (input.fee <= 0) return input.coveredHours > 0 ? 'covered' : 'no_charge';
  if (!input.invoiceId || !input.invoiceStatus) return 'not_invoiced';
  if (input.invoiceStatus === 'cancelled') return 'cancelled';
  if (input.invoiceStatus === 'paid') return 'paid';
  return input.inReview ? 'in_review' : 'unpaid';
}

export type ExtraHoursSummary = {
  days: number;
  hours: number;
  coveredHours: number;
  billedHours: number;
  /** All fees charged (cancelled invoices excluded). */
  fees: number;
  paid: number;
  /** Fees on open invoices, including ones awaiting finance review. */
  unpaid: number;
  inReview: number;
  /** Fees recorded but never invoiced. */
  notInvoiced: number;
};

export function summarizeExtraHours(days: ExtraHoursDay[]): ExtraHoursSummary {
  const s: ExtraHoursSummary = { days: 0, hours: 0, coveredHours: 0, billedHours: 0, fees: 0, paid: 0, unpaid: 0, inReview: 0, notInvoiced: 0 };
  for (const day of days) {
    s.days += 1;
    s.hours += day.hours;
    s.coveredHours += day.coveredHours;
    if (day.status === 'cancelled') continue;
    s.billedHours += day.billedHours;
    s.fees += day.fee;
    if (day.status === 'paid') s.paid += day.fee;
    else if (day.status === 'unpaid' || day.status === 'in_review') s.unpaid += day.fee;
    if (day.status === 'in_review') s.inReview += day.fee;
    if (day.status === 'not_invoiced') s.notInvoiced += day.fee;
  }
  return {
    days: s.days,
    hours: round2(s.hours),
    coveredHours: round2(s.coveredHours),
    billedHours: round2(s.billedHours),
    fees: round2(s.fees),
    paid: round2(s.paid),
    unpaid: round2(s.unpaid),
    inReview: round2(s.inReview),
    notInvoiced: round2(s.notInvoiced),
  };
}
