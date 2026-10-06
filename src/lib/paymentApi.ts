import { supabase } from '@/lib/supabase';

/**
 * Client side of the payment server functions (migration 20261007000000). Every money action
 * is one locked, idempotent RPC: a retried request with the same idempotency key returns the
 * first result instead of recording the payment twice.
 */

/** Methods a parent can declare for a payment the nursery verifies by hand. */
export const MANUAL_PAYMENT_METHODS = ['instapay', 'vodafone_cash', 'bank_transfer', 'cash'] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];
export type ParentPaymentMethodCode = ManualPaymentMethod | 'manual';

/** Transfers are matched by their reference number, so the parent must give one. */
export function methodNeedsReference(method: ParentPaymentMethodCode): boolean {
  return method === 'instapay' || method === 'vodafone_cash' || method === 'bank_transfer';
}

/** Manual methods this nursery accepts (nursery_settings.payment_methods_enabled). */
export function enabledManualMethods(enabled: string[] | null | undefined): ParentPaymentMethodCode[] {
  const list = enabled ?? [];
  const methods = MANUAL_PAYMENT_METHODS.filter((m) => list.includes(m));
  return methods.length ? methods : ['manual'];
}

/** One key per payment intent: create it when the parent starts paying, reuse it on retries. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export type SubmitPaymentResult = {
  status: 'submitted' | 'duplicate';
  attempt_id?: string;
  amount?: number;
  remaining?: number;
};

export async function submitInvoicePayment(input: {
  invoiceId: string;
  amount: number;
  method: ParentPaymentMethodCode;
  reference?: string | null;
  proofUrl?: string | null;
  idempotencyKey: string;
}): Promise<SubmitPaymentResult> {
  const { data, error } = await supabase.rpc('submit_invoice_payment' as never, {
    p_invoice_id: input.invoiceId,
    p_amount: Math.round(input.amount * 100) / 100,
    p_method: input.method,
    p_reference: input.reference?.trim() || null,
    p_proof_url: input.proofUrl ?? null,
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as SubmitPaymentResult;
}

export type ConfirmAttemptResult = {
  invoiceId: string;
  paymentId: string | null;
  confirmedAmount: number;
  paidAmount: number;
  invoiceStatus: string;
  applicationId: string | null;
};

export async function confirmPaymentAttempt(attemptId: string): Promise<ConfirmAttemptResult> {
  const { data, error } = await supabase.rpc('confirm_invoice_payment_attempt' as never, {
    p_attempt_id: attemptId,
  } as never);
  if (error) throw error;
  return data as ConfirmAttemptResult;
}

export async function rejectPaymentAttempt(attemptId: string, reason: string | null): Promise<{ status: string; changed: boolean }> {
  const { data, error } = await supabase.rpc('reject_invoice_payment_attempt' as never, {
    p_attempt_id: attemptId,
    p_reason: reason?.trim() || null,
  } as never);
  if (error) throw error;
  return data as { status: string; changed: boolean };
}

export type RecordPaymentResult = {
  status: 'recorded' | 'duplicate' | 'already_paid';
  payment_id: string | null;
  confirmed_amount?: number;
  paid_amount?: number;
  invoice_status?: string;
};

/** Staff record money received outside the app (cash at the desk, a transfer seen in the bank). */
export async function recordInvoicePayment(input: {
  invoiceId: string;
  amount: number;
  method: string;
  paidAt: string;
  idempotencyKey: string;
}): Promise<RecordPaymentResult> {
  const { data, error } = await supabase.rpc('admin_record_invoice_payment' as never, {
    p_invoice_id: input.invoiceId,
    p_amount: Math.round(input.amount * 100) / 100,
    p_method: input.method,
    p_paid_at: new Date(input.paidAt).toISOString(),
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as RecordPaymentResult;
}

export type RedeemPointsResult = { status: 'redeemed' | 'duplicate'; points?: number; discount?: number; new_amount?: number };

export async function redeemLoyaltyPoints(input: { invoiceId: string; points: number; idempotencyKey: string }): Promise<RedeemPointsResult> {
  const { data, error } = await supabase.rpc('redeem_loyalty_points' as never, {
    p_invoice_id: input.invoiceId,
    p_points: Math.floor(input.points),
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as RedeemPointsResult;
}

const PAYMENT_ERROR_CODES = [
  'payment_exceeds_balance',
  'payment_duplicate',
  'payment_invoice_closed',
  'payment_invoice_not_yours',
  'payment_invoice_not_found',
  'payment_attempt_not_found',
  'payment_invalid_amount',
  'payment_invalid_method',
  'payment_forbidden',
  'payment_not_authenticated',
  'loyalty_disabled',
  'loyalty_min_points',
  'loyalty_insufficient_points',
  'loyalty_exceeds_cap',
] as const;

/** Translation key and values for a payment RPC error (payment.errors.<code>). */
export function paymentError(error: unknown): { key: string; values: Record<string, string> } {
  const e = (error ?? {}) as { message?: unknown; details?: unknown };
  const message = typeof e.message === 'string' ? e.message : String(error ?? '');
  const code = PAYMENT_ERROR_CODES.find((c) => message.includes(c));
  if (!code) return { key: 'payment.errors.actionFailed', values: {} };
  // payment_exceeds_balance carries the amount still payable in its detail.
  const amount = typeof e.details === 'string' && /^\d+(\.\d+)?$/.test(e.details) ? Number(e.details).toFixed(2) : '';
  return { key: `payment.errors.${code}`, values: { amount } };
}
