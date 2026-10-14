import { supabase } from '@/lib/supabase';

/**
 * Client of the `invoice-checkout` Edge Function: Paymob online checkout for an invoice that
 * already exists. Signup opens its own checkout inside parent-signup-complete.
 */

export type OnlineCheckoutOptions = {
  /** Online checkout can be offered (Paymob configured for the nursery, or test mode). */
  available: boolean;
  /** Checkout is simulated: no provider is contacted and no money moves. */
  testMode: boolean;
};

export type StartCheckoutResult =
  /** Send the parent to Paymob's hosted checkout. */
  | { kind: 'redirect'; attemptId: string; checkoutUrl: string }
  /** Test mode recorded a test payment request; nothing was charged. */
  | { kind: 'test_submitted'; attemptId: string }
  /** This payment was already started with the same key; nothing new was created. */
  | { kind: 'duplicate'; attemptId: string | null };

/** Error thrown for a refused checkout; `message` is the payment_* code `paymentError` translates. */
export class CheckoutError extends Error {
  readonly details?: string;

  constructor(code: string, details?: string) {
    super(code);
    this.name = 'CheckoutError';
    this.details = details;
  }
}

const PAYMOB_CHECKOUT_ORIGIN = 'https://accept.paymob.com';
const PAYMOB_CHECKOUT_PATH = '/unifiedcheckout/';

/** Only Paymob's own checkout page may receive the parent; any other URL is refused. */
export function paymobCheckoutUrl(value: unknown): string {
  if (typeof value !== 'string') throw new CheckoutError('payment_checkout_invalid_url');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CheckoutError('payment_checkout_invalid_url');
  }
  if (url.origin !== PAYMOB_CHECKOUT_ORIGIN || !url.pathname.startsWith(PAYMOB_CHECKOUT_PATH)) {
    throw new CheckoutError('payment_checkout_invalid_url');
  }
  return url.toString();
}

export function parseStartCheckoutResponse(payload: unknown): StartCheckoutResult {
  const data = (payload ?? {}) as { status?: unknown; attempt_id?: unknown; checkout_url?: unknown };
  const attemptId = typeof data.attempt_id === 'string' ? data.attempt_id : null;
  if (data.status === 'duplicate') return { kind: 'duplicate', attemptId };
  if (!attemptId) throw new CheckoutError('payment_checkout_failed');
  if (data.status === 'test_submitted') return { kind: 'test_submitted', attemptId };
  if (data.status === 'redirect') return { kind: 'redirect', attemptId, checkoutUrl: paymobCheckoutUrl(data.checkout_url) };
  throw new CheckoutError('payment_checkout_failed');
}

/** Calls the function and turns an error response into a CheckoutError carrying its code. */
async function invokeCheckout(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('invoice-checkout', { body });
  if (!error) return data;

  let code = 'payment_checkout_failed';
  let details: string | undefined;
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const payload = (await context.clone().json()) as { error?: unknown; details?: unknown };
      if (typeof payload.error === 'string' && payload.error.startsWith('payment_')) code = payload.error;
      if (typeof payload.details === 'string') details = payload.details;
    } catch {
      // Not JSON (e.g. the function is not deployed): keep the generic code.
    }
  }
  throw new CheckoutError(code, details);
}

export async function fetchOnlineCheckoutOptions(nurseryId: string): Promise<OnlineCheckoutOptions> {
  const data = (await invokeCheckout({ action: 'options', nursery_id: nurseryId })) as {
    available?: unknown;
    test_mode?: unknown;
  } | null;
  return { available: data?.available === true, testMode: data?.test_mode === true };
}

export async function startInvoiceCheckout(input: {
  invoiceId: string;
  /** The amount the parent confirmed; the server never charges a different one. */
  amount: number;
  /** Same key for every retry of this one payment, so it is never recorded twice. */
  idempotencyKey: string;
  /** In-app `/parent/...` path Paymob returns the parent to. */
  returnPath: string;
}): Promise<StartCheckoutResult> {
  const data = await invokeCheckout({
    action: 'checkout',
    invoice_id: input.invoiceId,
    amount: Math.round(input.amount * 100) / 100,
    idempotency_key: input.idempotencyKey,
    return_path: input.returnPath,
  });
  return parseStartCheckoutResponse(data);
}
