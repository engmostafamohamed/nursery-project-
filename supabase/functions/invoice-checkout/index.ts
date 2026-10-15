import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createPaymobCheckout, getPaymobConfig, onlinePaymentTestMode } from '../_shared/paymob.ts';
import { parseResponseParams, responseCallbackHmacMessage, verifyHmac } from '../_shared/paymobCallback.ts';

/**
 * Paymob online checkout for an invoice that already exists (application packages, tuition,
 * events). Parent signup opens its own checkout in parent-signup-complete.
 *
 *   { action: 'options', nursery_id }
 *     → { available, test_mode }  whether online checkout can be offered for this nursery.
 *
 *   { action: 'checkout', invoice_id, amount, idempotency_key, return_path }
 *     Records the payment request through submit_invoice_payment as the signed-in parent, so the
 *     database applies its ownership, balance, full-payment and duplicate rules, then opens a
 *     Paymob checkout for exactly that amount. The amount is the one the parent confirmed on
 *     screen, so the parent is never charged more than they saw.
 *     → { status: 'redirect', attempt_id, checkout_url }
 *     | { status: 'test_submitted', attempt_id }   test mode: nothing is charged
 *     | { status: 'duplicate', attempt_id }        this key was already used; nothing new is created
 *
 *   { action: 'return', params }
 *     The query parameters Paymob added when it sent the parent back. When their HMAC matches
 *     PAYMOB_HMAC_SECRET the result is applied at once (paymob_settle_attempt), so a declined
 *     payment frees the invoice for another try right away. paymob-webhook applies the same
 *     result from Paymob's server; whichever arrives second is a no-op.
 *     → { status: 'settled', outcome, attempt_status, failure_reason, provider_reference }
 *     | { status: 'unverified' }   no HMAC secret configured, or no signed result in the params
 *
 * Errors are { error: <code>, details? } where <code> is a payment_* code the app translates.
 * Unsigned browser parameters are never trusted (docs/paymob-checkout.md).
 */

type Body = {
  action?: string;
  nursery_id?: string;
  invoice_id?: string;
  idempotency_key?: string;
  return_path?: string;
  amount?: number;
  params?: Record<string, unknown>;
};

type InvoiceRow = {
  id: string;
  nursery_id: string;
  parent_id: string | null;
  line_items_json: Record<string, unknown> | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// In-app parent routes only, so the provider can never send the parent elsewhere.
const RETURN_PATH_PATTERN = /^\/parent\/[A-Za-z0-9/_\-?=&.%]*$/;
const DEFAULT_RETURN_PATH = '/parent/invoices';

function errorResponse(code: string, status: number, details?: string): Response {
  return jsonResponse({ error: code, ...(details ? { details } : {}) }, status);
}

// Codes raised by submit_invoice_payment and its insert trigger; the app translates each one.
const PAYMENT_ERROR_CODES = [
  'payment_exceeds_balance',
  'payment_full_amount_required',
  'payment_duplicate',
  'payment_invoice_closed',
  'payment_invoice_not_yours',
  'payment_invoice_not_found',
  'payment_invalid_amount',
  'payment_invalid_method',
  'payment_forbidden',
  'payment_not_authenticated',
];

/** Maps a database error from submit_invoice_payment to the payment_* code it carries. */
function rpcErrorResponse(error: { message?: string; details?: string; code?: string }): Response {
  const message = error.message ?? '';
  const code = PAYMENT_ERROR_CODES.find((candidate) => message.includes(candidate)) ?? 'payment_checkout_failed';
  const status = code === 'payment_invoice_not_yours' || code === 'payment_forbidden' ? 403 : 409;
  return errorResponse(code, status, error.details);
}

function returnPathWithStatus(raw: string | undefined): string {
  const path = raw && RETURN_PATH_PATTERN.test(raw) && !raw.includes('//') ? raw : DEFAULT_RETURN_PATH;
  const url = new URL(path, 'https://app.invalid');
  url.searchParams.set('payment', 'processing');
  return `${url.pathname}${url.search}`;
}

function onlineCheckoutAvailable(enabledMethods: string[] | null | undefined): boolean {
  if (onlinePaymentTestMode()) return true;
  try {
    return getPaymobConfig(enabledMethods) !== null;
  } catch (error) {
    // A malformed secret disables online checkout instead of breaking the payment page.
    console.error('Paymob configuration error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function enabledPaymentMethods(admin: ReturnType<typeof getAdminClient>, nurseryId: string) {
  const { data, error } = await admin
    .from('nursery_settings')
    .select('payment_methods_enabled')
    .eq('nursery_id', nurseryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const enabled = (data as { payment_methods_enabled?: unknown } | null)?.payment_methods_enabled;
  return Array.isArray(enabled) ? enabled.filter((value): value is string => typeof value === 'string') : null;
}

async function parentContact(admin: ReturnType<typeof getAdminClient>, parentId: string, fallbackEmail: string) {
  const { data } = await admin
    .from('users')
    .select('name_ar, name_en, email, phone')
    .eq('id', parentId)
    .maybeSingle();
  const profile = (data ?? {}) as { name_ar?: string | null; name_en?: string | null; email?: string | null; phone?: string | null };
  return {
    name: profile.name_en?.trim() || profile.name_ar?.trim() || 'Parent',
    email: profile.email?.trim() || fallbackEmail,
    phone: profile.phone?.trim() || '',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Server misconfiguration' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('payment_not_authenticated', 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return errorResponse('payment_not_authenticated', 401);
  const user = authData.user;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const admin = getAdminClient();

  try {
    if (body.action === 'options') {
      if (!body.nursery_id || !UUID_PATTERN.test(body.nursery_id)) return jsonResponse({ error: 'Missing nursery_id' }, 400);
      const enabled = await enabledPaymentMethods(admin, body.nursery_id);
      return jsonResponse({ available: onlineCheckoutAvailable(enabled), test_mode: onlinePaymentTestMode() });
    }

    if (body.action === 'return') {
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.params ?? {})) {
        if (typeof value === 'string' && key.length <= 64 && value.length <= 512) params[key] = value;
      }
      const secret = Deno.env.get('PAYMOB_HMAC_SECRET')?.trim();
      if (!secret || !params.hmac) return jsonResponse({ status: 'unverified' });
      if (!(await verifyHmac(secret, responseCallbackHmacMessage(params), params.hmac))) {
        return errorResponse('payment_return_invalid', 400);
      }

      const transaction = parseResponseParams(params);
      if (!transaction.attemptId) return errorResponse('payment_attempt_not_found', 404);
      const { data: ownerRow, error: ownerError } = await admin
        .from('payment_attempts')
        .select('parent_id')
        .eq('id', transaction.attemptId)
        .maybeSingle();
      if (ownerError) throw new Error(ownerError.message);
      if (!ownerRow) return errorResponse('payment_attempt_not_found', 404);
      if ((ownerRow as { parent_id: string }).parent_id !== user.id) return errorResponse('payment_forbidden', 403);

      const { data: settled, error: settleError } = await admin.rpc('paymob_settle_attempt', {
        p_attempt_id: transaction.attemptId,
        p_source: 'redirect',
        p_transaction_id: transaction.transactionId,
        p_success: transaction.success,
        p_pending: transaction.pending,
        p_amount_cents: transaction.amountCents,
        p_currency: transaction.currency,
        p_reason_code: transaction.reasonCode,
        p_provider_message: transaction.message,
        p_provider_reference: transaction.providerReference,
        p_payload: params,
      });
      if (settleError) throw new Error(settleError.message);
      const outcome = (settled ?? {}) as Record<string, unknown>;
      return jsonResponse({
        status: 'settled',
        outcome: outcome.outcome ?? null,
        attempt_status: outcome.attempt_status ?? null,
        failure_reason: outcome.failure_reason ?? null,
        provider_reference: outcome.provider_reference ?? null,
      });
    }

    if (body.action !== 'checkout') return jsonResponse({ error: 'Unknown action' }, 400);
    if (!body.invoice_id || !UUID_PATTERN.test(body.invoice_id)) return errorResponse('payment_invoice_not_found', 404);
    if (!body.idempotency_key || !UUID_PATTERN.test(body.idempotency_key)) {
      return jsonResponse({ error: 'Missing idempotency_key' }, 400);
    }

    const { data: invoiceData, error: invoiceError } = await admin
      .from('invoices')
      .select('id, nursery_id, parent_id, line_items_json')
      .eq('id', body.invoice_id)
      .maybeSingle();
    if (invoiceError) throw new Error(invoiceError.message);
    const invoice = invoiceData as InvoiceRow | null;
    if (!invoice) return errorResponse('payment_invoice_not_found', 404);
    if (invoice.parent_id !== user.id) return errorResponse('payment_invoice_not_yours', 403);

    const enabled = await enabledPaymentMethods(admin, invoice.nursery_id);
    if (!onlineCheckoutAvailable(enabled)) return errorResponse('payment_checkout_unavailable', 409);

    const amount = typeof body.amount === 'number' && Number.isFinite(body.amount)
      ? Math.round(body.amount * 100) / 100
      : 0;
    if (!(amount > 0)) return errorResponse('payment_invalid_amount', 400);

    const { data: attemptData, error: attemptError } = await userClient.rpc('submit_invoice_payment', {
      p_invoice_id: invoice.id,
      p_amount: amount,
      p_method: 'card',
      p_reference: null,
      p_proof_url: null,
      p_idempotency_key: body.idempotency_key,
    });
    if (attemptError) return rpcErrorResponse(attemptError);
    const attempt = (attemptData ?? {}) as { status?: string; attempt_id?: string };
    if (attempt.status === 'duplicate') {
      return jsonResponse({ status: 'duplicate', attempt_id: attempt.attempt_id ?? null });
    }
    const attemptId = attempt.attempt_id;
    if (!attemptId) throw new Error('The payment request was created without an attempt ID');

    if (onlinePaymentTestMode()) {
      const { error: testNoteError } = await admin
        .from('payment_attempts')
        .update({ notes: '[TEST PAYMENT] No money was charged. Do not confirm as a real payment.' })
        .eq('id', attemptId);
      if (testNoteError) throw new Error(`Could not mark the payment as a test: ${testNoteError.message}`);
      return jsonResponse({ status: 'test_submitted', attempt_id: attemptId });
    }

    try {
      const contact = await parentContact(admin, user.id, user.email ?? '');
      const isApplicationInvoice = typeof invoice.line_items_json?.application_id === 'string';
      const checkout = await createPaymobCheckout({
        amount,
        attemptId,
        customerName: contact.name,
        customerEmail: contact.email,
        customerPhone: contact.phone,
        address: null,
        enabledPaymentMethods: enabled,
        returnPath: returnPathWithStatus(body.return_path),
        item: isApplicationInvoice
          ? { name: 'Nursery registration', description: 'Selected tuition package' }
          : { name: 'Nursery invoice', description: `Invoice ${invoice.id.slice(0, 8)}` },
      });
      const { error: intentionError } = await admin
        .from('payment_attempts')
        .update({ paymob_intention_id: checkout.intentionId })
        .eq('id', attemptId);
      if (intentionError) throw new Error(`Could not save the Paymob checkout reference: ${intentionError.message}`);
      return jsonResponse({ status: 'redirect', attempt_id: attemptId, checkout_url: checkout.checkoutUrl });
    } catch (checkoutError) {
      // The parent never reached Paymob: release the pending amount so they can pay again.
      const { error: failError } = await admin
        .from('payment_attempts')
        .update({ status: 'failed', failure_reason: 'provider_error', notes: 'Paymob checkout could not be initialized.' })
        .eq('id', attemptId)
        .eq('status', 'pending_confirmation');
      if (failError) console.error('Could not mark the failed Paymob attempt:', failError.message);
      console.error('Paymob checkout failed:', checkoutError instanceof Error ? checkoutError.message : checkoutError);
      return errorResponse('payment_checkout_unavailable', 502);
    }
  } catch (error) {
    console.error('invoice-checkout failed:', error instanceof Error ? error.message : error);
    return errorResponse('payment_checkout_failed', 500);
  }
});
