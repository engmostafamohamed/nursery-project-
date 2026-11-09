import { supabase } from '@/lib/supabase';

import type { BillingInvoice, InvoiceStatus, InvoiceType, LoyaltyOffer } from './parentBilling';

/*
 * Reading the parent's bills: get_parent_billing (every invoice) and get_parent_invoice (one, with
 * its payments, what is in review, reminders and the points offer). Both are RPCs, so a screen
 * opened right after paying shows the new state (table reads may come from the offline cache).
 */

type Json = Record<string, unknown>;

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

const TYPES: InvoiceType[] = ['monthly', 'event', 'extra_hours', 'other', 'food_extras'];
const STATUSES: InvoiceStatus[] = ['pending', 'overdue', 'paid', 'cancelled'];

export function toBillingInvoice(row: Json): BillingInvoice {
  const type = str(row.type) as InvoiceType;
  const status = str(row.status) as InvoiceStatus;
  return {
    id: str(row.id),
    nurseryId: str(row.nursery_id),
    invoiceNumber: str(row.invoice_number),
    amount: num(row.amount),
    type: TYPES.includes(type) ? type : 'other',
    status: STATUSES.includes(status) ? status : 'pending',
    dueDate: str(row.due_date),
    createdAt: str(row.created_at),
    paidAt: strOrNull(row.paid_at),
    paymentMethod: strOrNull(row.payment_method),
    lineItems: row.line_items ?? null,
    paidAmount: num(row.paid_amount),
    pendingAmount: num(row.pending_amount),
    payable: num(row.payable),
    overdueDays: num(row.overdue_days),
    applicationId: strOrNull(row.application_id),
    childIds: Array.isArray(row.child_ids) ? (row.child_ids as unknown[]).filter((id): id is string => typeof id === 'string') : [],
  };
}

export type InvoiceChild = { id: string; name_ar: string; name_en: string };
export type InvoicePayment = { id: string; amount: number; method: string; at: string };
export type InvoiceReminder = { type: string; sentAt: string };

export type BillingInvoiceDetails = BillingInvoice & {
  /** The parent the invoice is billed to (the reader). */
  parent: { name_ar: string; name_en: string };
  children: InvoiceChild[];
  /** Completed payments, newest first. */
  payments: InvoicePayment[];
  /** Payments sent and waiting for the nursery, oldest first. */
  inReview: InvoicePayment[];
  reminders: InvoiceReminder[];
  loyalty: LoyaltyOffer;
};

export function toBillingInvoiceDetails(row: Json): BillingInvoiceDetails {
  const loyalty = (row.loyalty ?? {}) as Json;
  const payment = (p: Json, at: unknown): InvoicePayment => ({ id: str(p.id), amount: num(p.amount), method: str(p.method), at: str(at) });
  const parent = (row.parent ?? {}) as Json;
  return {
    ...toBillingInvoice(row),
    parent: { name_ar: str(parent.name_ar), name_en: str(parent.name_en) },
    children: list(row.children).map((c) => ({ id: str(c.id), name_ar: str(c.name_ar), name_en: str(c.name_en) })),
    payments: list(row.payments).map((p) => payment(p, p.paid_at)),
    inReview: list(row.in_review).map((p) => payment(p, p.created_at)),
    reminders: list(row.reminders).map((r) => ({ type: str(r.type), sentAt: str(r.sent_at) })),
    loyalty: {
      enabled: loyalty.enabled === true,
      rate: num(loyalty.rate),
      balance: num(loyalty.balance),
      minPoints: num(loyalty.min_points),
      maxDiscount: num(loyalty.max_discount),
    },
  };
}

export async function fetchParentBilling(): Promise<BillingInvoice[]> {
  const { data, error } = await supabase.rpc('get_parent_billing' as never);
  if (error) throw error;
  return list(data).map(toBillingInvoice);
}

/** Null when the invoice does not exist (or no longer does). */
export async function fetchParentInvoice(invoiceId: string): Promise<BillingInvoiceDetails | null> {
  const { data, error } = await supabase.rpc('get_parent_invoice' as never, { p_invoice_id: invoiceId } as never);
  if (error) throw error;
  return data ? toBillingInvoiceDetails(data as Json) : null;
}
