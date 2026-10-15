import { getAdminClient } from '../_shared/admin.ts';
import { jsonResponse } from '../_shared/http.ts';
import { parseProcessedTransaction, processedCallbackHmacMessage, verifyHmac } from '../_shared/paymobCallback.ts';

/**
 * Paymob "transaction processed" callback: the server-to-server result of an online payment.
 *
 * Paymob POSTs `{ type: 'TRANSACTION', obj }` with `?hmac=` in the URL. Only a result whose HMAC
 * matches PAYMOB_HMAC_SECRET is applied, through paymob_settle_attempt, which confirms the
 * attempt for the exact amount, releases it on failure, or keeps it pending (e.g. a Fawry
 * reference) and records the event in payment_events.
 *
 * Deployed without JWT verification (Paymob sends no Supabase token); the HMAC is the auth.
 * Every intention names this URL as its notification_url; also set it as the transaction
 * processed callback of each Paymob integration (wallets, InstaPay, Fawry) in the dashboard.
 */

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('PAYMOB_HMAC_SECRET')?.trim();
  if (!secret) {
    console.error('paymob-webhook: PAYMOB_HMAC_SECRET is not set; refusing the callback');
    return jsonResponse({ error: 'not_configured' }, 503);
  }

  let body: { type?: unknown; obj?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  // Token and other callback types carry nothing to settle.
  if (body.type !== 'TRANSACTION' || !body.obj || typeof body.obj !== 'object') {
    return jsonResponse({ status: 'ignored' });
  }

  const hmac = new URL(req.url).searchParams.get('hmac');
  if (!(await verifyHmac(secret, processedCallbackHmacMessage(body.obj), hmac))) {
    console.warn('paymob-webhook: HMAC mismatch; callback rejected');
    return jsonResponse({ error: 'invalid_hmac' }, 401);
  }

  const transaction = parseProcessedTransaction(body.obj);
  const { data, error } = await getAdminClient().rpc('paymob_settle_attempt', {
    p_attempt_id: transaction.attemptId,
    p_source: 'webhook',
    p_transaction_id: transaction.transactionId,
    p_success: transaction.success,
    p_pending: transaction.pending,
    p_amount_cents: transaction.amountCents,
    p_currency: transaction.currency,
    p_reason_code: transaction.reasonCode,
    p_provider_message: transaction.message,
    p_provider_reference: transaction.providerReference,
    p_payload: body,
  });
  if (error) {
    // A 5xx makes Paymob retry; the settlement is idempotent per transaction.
    console.error('paymob-webhook: settlement failed:', error.message);
    return jsonResponse({ error: 'settlement_failed' }, 500);
  }

  return jsonResponse({ status: 'ok', outcome: (data as { outcome?: string } | null)?.outcome ?? null });
});
