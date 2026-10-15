/**
 * Paymob transaction results: HMAC verification and the fields the app needs.
 *
 * Paymob reports a transaction twice: the "processed" callback (server POST with a JSON body,
 * sent to the intention's notification_url or the integration's callback URL) and the
 * "response" callback (the parent's browser redirected to redirection_url with query params).
 * Both carry an `hmac` query parameter: SHA-512, keyed with the account's HMAC secret, over these
 * fields' values concatenated in this order with no separator
 * (https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback).
 *
 * Pure functions only (Web Crypto, no Deno APIs), so they can be tested outside Deno.
 */

/** [processed callback path inside `obj`, response callback query key]. */
const HMAC_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['amount_cents', 'amount_cents'],
  ['created_at', 'created_at'],
  ['currency', 'currency'],
  ['error_occured', 'error_occured'],
  ['has_parent_transaction', 'has_parent_transaction'],
  ['id', 'id'],
  ['integration_id', 'integration_id'],
  ['is_3d_secure', 'is_3d_secure'],
  ['is_auth', 'is_auth'],
  ['is_capture', 'is_capture'],
  ['is_refunded', 'is_refunded'],
  ['is_standalone_payment', 'is_standalone_payment'],
  ['is_voided', 'is_voided'],
  ['order.id', 'order_id'],
  ['owner', 'owner'],
  ['pending', 'pending'],
  ['source_data.pan', 'source_data.pan'],
  ['source_data.sub_type', 'source_data.sub_type'],
  ['source_data.type', 'source_data.type'],
  ['success', 'success'],
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function at(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (value, key) => (value && typeof value === 'object' ? (value as JsonObject)[key] : undefined),
    source,
  );
}

/** Missing values contribute nothing, as in Paymob's reference implementations. */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** The string Paymob signs for a processed (POST) callback; `obj` is the body's `obj`. */
export function processedCallbackHmacMessage(obj: unknown): string {
  return HMAC_FIELDS.map(([path]) => text(at(obj, path))).join('');
}

/**
 * The string Paymob signs for a response (redirect) callback. Older redirects name the order
 * `order` instead of `order_id`.
 */
export function responseCallbackHmacMessage(params: Record<string, string>): string {
  return HMAC_FIELDS.map(([, key]) => text(key === 'order_id' ? params.order_id ?? params.order : params[key])).join('');
}

export async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compares in time independent of where the strings differ. */
export function sameHex(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function verifyHmac(secret: string, message: string, received: string | null | undefined): Promise<boolean> {
  if (!secret || !received) return false;
  return sameHex(await hmacSha512Hex(secret, message), received);
}

/**
 * Why a transaction failed, as a code the app translates (payment.failure.reasons.*). Paymob
 * describes the result in free text, so this matches its common wordings and otherwise falls
 * back to a plain decline.
 */
export function failureReasonCode(message: unknown, responseCode: unknown): string {
  const haystack = `${text(message)} ${text(responseCode)}`.toLowerCase();
  if (/insufficient|not enough|balance/.test(haystack)) return 'insufficient_funds';
  if (/expired card|card expired|expiry/.test(haystack)) return 'card_expired';
  if (/3d|3-d|secure|authenticat|otp|verification/.test(haystack)) return 'authentication_failed';
  if (/timeout|timed out|time out/.test(haystack)) return 'timeout';
  if (/cancel/.test(haystack)) return 'cancelled';
  if (/do not honou?r|declined|restricted|not permitted|invalid card|lost|stolen/.test(haystack)) return 'declined';
  if (/system|network|unavailable|try again|internal/.test(haystack)) return 'provider_error';
  return 'declined';
}

export type PaymobTransactionResult = {
  transactionId: string | null;
  /** Our payment_attempts id, sent as the intention's special_reference. */
  attemptId: string | null;
  success: boolean;
  pending: boolean;
  amountCents: number | null;
  currency: string | null;
  message: string | null;
  reasonCode: string | null;
  /** Reference issued for a pending payment, e.g. a Fawry/kiosk bill reference. */
  providerReference: string | null;
};

function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

function integer(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function nonEmpty(value: unknown): string | null {
  const s = text(value).trim();
  return s ? s : null;
}

function result(fields: {
  transactionId: unknown;
  attemptId: unknown;
  success: unknown;
  pending: unknown;
  amountCents: unknown;
  currency: unknown;
  message: unknown;
  responseCode: unknown;
  providerReference: unknown;
}): PaymobTransactionResult {
  const success = bool(fields.success);
  const pending = bool(fields.pending);
  return {
    transactionId: nonEmpty(fields.transactionId),
    attemptId: uuid(fields.attemptId),
    success,
    pending,
    amountCents: integer(fields.amountCents),
    currency: nonEmpty(fields.currency),
    message: nonEmpty(fields.message),
    reasonCode: success || pending ? null : failureReasonCode(fields.message, fields.responseCode),
    providerReference: nonEmpty(fields.providerReference),
  };
}

/** The processed callback's `obj` (body `{ type: 'TRANSACTION', obj }`). */
export function parseProcessedTransaction(obj: unknown): PaymobTransactionResult {
  return result({
    transactionId: at(obj, 'id'),
    attemptId: at(obj, 'order.merchant_order_id') ?? at(obj, 'payment_key_claims.extra.attempt_id'),
    success: at(obj, 'success'),
    pending: at(obj, 'pending'),
    amountCents: at(obj, 'amount_cents'),
    currency: at(obj, 'currency'),
    message: at(obj, 'data.message'),
    responseCode: at(obj, 'data.txn_response_code'),
    providerReference: at(obj, 'data.bill_reference') ?? at(obj, 'data.bill_ref'),
  });
}

/** The query parameters Paymob adds to redirection_url. */
export function parseResponseParams(params: Record<string, string>): PaymobTransactionResult {
  return result({
    transactionId: params.id,
    attemptId: params.merchant_order_id,
    success: params.success,
    pending: params.pending,
    amountCents: params.amount_cents,
    currency: params.currency,
    message: params['data.message'],
    responseCode: params.txn_response_code,
    providerReference: params['data.bill_reference'] ?? params.bill_reference,
  });
}
