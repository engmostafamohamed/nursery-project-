// Module 7 · Billing, payments & finance — the payment methods a parent can use, what each one
// needs before it can be paid, one-payment application invoices, and the Paymob checkout client.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lineExtraHours } from '@/hooks/useApplicationPackagePayment';

import { formatMoneyAmount } from './money';
import { paymentError } from './paymentApi';
import {
  availableParentPaymentMethods,
  EMPTY_PAYMENT_DETAILS,
  invoiceApplicationId,
  payableNow,
  paymentDetailsIssues,
  paymentFlowOf,
  paymentReferenceFor,
  receiptFileError,
  receiptStoragePath,
  RECEIPT_MAX_BYTES,
} from './paymentMethods';
import {
  CheckoutError,
  fetchOnlineCheckoutOptions,
  hasPaymobReturnParams,
  parseCheckoutReturnResponse,
  parseStartCheckoutResponse,
  paymobCheckoutUrl,
  paymobReturnParams,
  startInvoiceCheckout,
  verifyCheckoutReturn,
} from './paymob/checkout';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

const CHECKOUT_URL = 'https://accept.paymob.com/unifiedcheckout/?publicKey=pk&clientSecret=cs';
const noWallet = { walletDestination: null, testMode: false };

describe('payment methods a parent can choose', () => {
  it('knows how each method is paid', () => {
    expect(paymentFlowOf('card')).toBe('online_checkout');
    expect(paymentFlowOf('etisalat_cash')).toBe('wallet_receipt');
    for (const method of ['instapay', 'vodafone_cash', 'bank_transfer', 'fawry'] as const) {
      expect(paymentFlowOf(method), method).toBe('transfer');
    }
    expect(paymentFlowOf('manual')).toBe('review');
  });

  it('orders InstaPay, online checkout, wallets, bank transfer, then Fawry; online only when ready', () => {
    expect(availableParentPaymentMethods({ enabled: ['instapay', 'fawry_manual'], onlineCheckoutAvailable: true }))
      .toEqual(['instapay', 'card', 'fawry']);
    expect(availableParentPaymentMethods({
      enabled: ['fawry_manual', 'bank_transfer', 'etisalat_cash', 'vodafone_cash', 'instapay'],
      onlineCheckoutAvailable: true,
    })).toEqual(['instapay', 'card', 'vodafone_cash', 'etisalat_cash', 'bank_transfer', 'fawry']);
    expect(availableParentPaymentMethods({ enabled: ['instapay', 'fawry_manual'], onlineCheckoutAvailable: false }))
      .toEqual(['instapay', 'fawry']);
    expect(availableParentPaymentMethods({ enabled: null, onlineCheckoutAvailable: false })).toEqual(['manual']);
  });
});

describe('what each method needs before it can be paid', () => {
  it('asks for a transaction number of at least 4 characters for transfers', () => {
    const details = { ...EMPTY_PAYMENT_DETAILS, reference: ' 12 ' };
    expect(paymentDetailsIssues('instapay', details, noWallet)).toEqual(['reference_required']);
    expect(paymentDetailsIssues('instapay', { ...details, reference: ' 1234 ' }, noWallet)).toEqual([]);
  });

  it('asks Etisalat Cash for the nursery number, a valid wallet phone, the name and the receipt', () => {
    expect(paymentDetailsIssues('etisalat_cash', EMPTY_PAYMENT_DETAILS, noWallet)).toEqual([
      'wallet_destination_missing',
      'wallet_phone_invalid',
      'wallet_name_required',
      'wallet_receipt_required',
    ]);
    const complete = {
      ...EMPTY_PAYMENT_DETAILS,
      walletPhone: '01112345678',
      walletCustomerName: 'Mona Ali',
      walletReceipt: new File(['x'], 'receipt.png', { type: 'image/png' }),
    };
    expect(paymentDetailsIssues('etisalat_cash', complete, { walletDestination: '01012345678', testMode: false })).toEqual([]);
    expect(paymentDetailsIssues('etisalat_cash', { ...complete, walletPhone: '01312345678' }, { walletDestination: '010', testMode: false }))
      .toEqual(['wallet_phone_invalid']);
  });

  it('needs nothing for online checkout, except the filled test card in test mode', () => {
    expect(paymentDetailsIssues('card', EMPTY_PAYMENT_DETAILS, noWallet)).toEqual([]);
    expect(paymentDetailsIssues('card', EMPTY_PAYMENT_DETAILS, { walletDestination: null, testMode: true })).toEqual(['test_card_invalid']);
    expect(paymentDetailsIssues('card', { ...EMPTY_PAYMENT_DETAILS, testCardValid: true }, { walletDestination: null, testMode: true }))
      .toEqual([]);
  });

  it('saves the reference finance matches the money with', () => {
    expect(paymentReferenceFor('bank_transfer', { ...EMPTY_PAYMENT_DETAILS, reference: '  TX-9  ' })).toBe('TX-9');
    expect(paymentReferenceFor('bank_transfer', EMPTY_PAYMENT_DETAILS)).toBeNull();
    expect(paymentReferenceFor('etisalat_cash', { ...EMPTY_PAYMENT_DETAILS, walletPhone: '01112345678', walletCustomerName: ' Mona ' }))
      .toBe('Wallet phone: 01112345678; customer name: Mona');
    expect(paymentReferenceFor('card', { ...EMPTY_PAYMENT_DETAILS, reference: 'ignored' })).toBeNull();
  });

  it('accepts PNG, JPG or WebP receipts up to 5 MB, stored under the nursery, parent and invoice', () => {
    expect(receiptFileError({ type: 'image/png', size: 100 })).toBeNull();
    expect(receiptFileError({ type: 'application/pdf', size: 100 })).toBe('invalid_type');
    expect(receiptFileError({ type: 'image/jpeg', size: RECEIPT_MAX_BYTES + 1 })).toBe('too_large');
    expect(receiptStoragePath({ nurseryId: 'n1', parentId: 'p1', invoiceId: 'i1', file: { type: 'image/webp' }, now: 42 }))
      .toBe('n1/p1/i1/42.webp');
    expect(receiptStoragePath({ nurseryId: 'n1', parentId: 'p1', invoiceId: 'i1', file: { type: 'image/jpeg' }, now: 42 }))
      .toBe('n1/p1/i1/42.jpg');
  });
});

describe('one payment for application invoices', () => {
  it('pays what is still due once payments awaiting confirmation are counted', () => {
    expect(payableNow({ balanceDue: 1500, pendingAmount: 0 })).toBe(1500);
    expect(payableNow({ balanceDue: 1500, pendingAmount: 500.004 })).toBe(1000);
    expect(payableNow({ balanceDue: 1500, pendingAmount: 1500 })).toBe(0);
    expect(payableNow({ balanceDue: 100, pendingAmount: 300 })).toBe(0);
  });

  it('recognises an invoice created for an application, like the database does', () => {
    expect(invoiceApplicationId({ application_id: 'app-1', items: [] })).toBe('app-1');
    expect(invoiceApplicationId({ application_id: '  ' })).toBeNull();
    expect(invoiceApplicationId({ items: [] })).toBeNull();
    expect(invoiceApplicationId([{ application_id: 'app-1' }])).toBeNull();
    expect(invoiceApplicationId(null)).toBeNull();
  });

  it('tells the parent the full amount when the database refuses a partial payment', () => {
    const error = { message: 'payment_full_amount_required', details: '1500' };
    expect(paymentError(error)).toEqual({ key: 'payment.errors.payment_full_amount_required', values: { amount: '1500.00' } });
  });
});

describe('extra-hours package on the application invoice', () => {
  it('reads the package the database (or signup) billed on the invoice', () => {
    expect(lineExtraHours({
      application_id: 'app-1',
      extra_hours_package_id: 'pkg-9',
      extra_hours_package_name_en: '10 extra hours',
      extra_hours_package_name_ar: '10 ساعات',
      extra_hours_subtotal: '1500.00',
      extra_hours_discount_amount: 150,
    })).toEqual({ packageId: 'pkg-9', nameEn: '10 extra hours', nameAr: '10 ساعات', subtotal: 1500, discountAmount: 150, total: 1350 });
  });

  it('means pay per hour when no package is on the invoice', () => {
    expect(lineExtraHours({ application_id: 'app-1', items: [] })).toBeNull();
    expect(lineExtraHours(null)).toBeNull();
  });
});

describe('money shown to parents', () => {
  it('groups thousands and shows piastres only when there are any', () => {
    expect(formatMoneyAmount(10596)).toBe('10,596');
    expect(formatMoneyAmount(3532.5)).toBe('3,532.50');
    expect(formatMoneyAmount(404.004)).toBe('404');
    expect(formatMoneyAmount(Number.NaN)).toBe('0');
  });
});

describe('Paymob online checkout', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("sends the parent only to Paymob's own checkout page", () => {
    expect(paymobCheckoutUrl(CHECKOUT_URL)).toBe(CHECKOUT_URL);
    for (const bad of [
      'https://evil.example/unifiedcheckout/',
      'http://accept.paymob.com/unifiedcheckout/',
      'https://accept.paymob.com/elsewhere',
      'not a url',
      undefined,
    ]) {
      expect(() => paymobCheckoutUrl(bad), String(bad)).toThrow('payment_checkout_invalid_url');
    }
  });

  it('reads the checkout result', () => {
    expect(parseStartCheckoutResponse({ status: 'redirect', attempt_id: 'a1', checkout_url: CHECKOUT_URL }))
      .toEqual({ kind: 'redirect', attemptId: 'a1', checkoutUrl: CHECKOUT_URL });
    expect(parseStartCheckoutResponse({ status: 'test_submitted', attempt_id: 'a1' })).toEqual({ kind: 'test_submitted', attemptId: 'a1' });
    expect(parseStartCheckoutResponse({ status: 'duplicate', attempt_id: null })).toEqual({ kind: 'duplicate', attemptId: null });
    expect(() => parseStartCheckoutResponse({ status: 'redirect', checkout_url: CHECKOUT_URL })).toThrow('payment_checkout_failed');
    expect(() => parseStartCheckoutResponse({ status: 'redirect', attempt_id: 'a1', checkout_url: 'https://evil.example' }))
      .toThrow('payment_checkout_invalid_url');
  });

  it('asks the server for exactly the confirmed amount, rounded to piastres, with the retry key', async () => {
    invoke.mockResolvedValue({ data: { status: 'redirect', attempt_id: 'a1', checkout_url: CHECKOUT_URL }, error: null });
    const result = await startInvoiceCheckout({
      invoiceId: 'inv-1',
      amount: 1500.456,
      idempotencyKey: 'key-1',
      returnPath: '/parent/applications/app-1?step=payment',
    });
    expect(result.kind).toBe('redirect');
    expect(invoke).toHaveBeenCalledWith('invoice-checkout', {
      body: {
        action: 'checkout',
        invoice_id: 'inv-1',
        amount: 1500.46,
        idempotency_key: 'key-1',
        return_path: '/parent/applications/app-1?step=payment',
      },
    });
  });

  it("passes on the server's refusal code and amount", async () => {
    const context = new Response(JSON.stringify({ error: 'payment_full_amount_required', details: '1500.00' }), { status: 409 });
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });
    const failure = await startInvoiceCheckout({ invoiceId: 'inv-1', amount: 10, idempotencyKey: 'k', returnPath: '/parent/invoices' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CheckoutError);
    expect(paymentError(failure)).toEqual({ key: 'payment.errors.payment_full_amount_required', values: { amount: '1500.00' } });
  });

  it('treats an undeployed or broken function as a generic checkout failure', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request', context: new Response('<html>', { status: 404 }) } });
    await expect(fetchOnlineCheckoutOptions('n1')).rejects.toThrow('payment_checkout_failed');
  });

  it('offers online checkout only when the server says so', async () => {
    invoke.mockResolvedValue({ data: { available: true, test_mode: false }, error: null });
    await expect(fetchOnlineCheckoutOptions('n1')).resolves.toEqual({ available: true, testMode: false });
    invoke.mockResolvedValue({ data: { available: 'yes' }, error: null });
    await expect(fetchOnlineCheckoutOptions('n1')).resolves.toEqual({ available: false, testMode: false });
  });
});

describe('coming back from Paymob', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  const returnUrl = new URLSearchParams(
    'step=payment&payment=processing&id=192036465&success=false&pending=false&amount_cents=100000'
      + '&merchant_order_id=7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f&data.message=Insufficient+Funds&hmac=abc',
  );

  it('recognises a signed Paymob result and sends only its own parameters', () => {
    expect(hasPaymobReturnParams(returnUrl)).toBe(true);
    expect(hasPaymobReturnParams(new URLSearchParams('step=payment&payment=processing'))).toBe(false);
    const params = paymobReturnParams(returnUrl);
    expect(params.step).toBeUndefined();
    expect(params.payment).toBeUndefined();
    expect(params['data.message']).toBe('Insufficient Funds');
    expect(params.hmac).toBe('abc');
  });

  it('asks the server to verify the result and reads what it applied', async () => {
    invoke.mockResolvedValue({
      data: { status: 'settled', outcome: 'failed', attempt_status: 'failed', failure_reason: 'insufficient_funds', provider_reference: null },
      error: null,
    });
    const result = await verifyCheckoutReturn(paymobReturnParams(returnUrl));
    expect(result).toEqual({
      kind: 'settled',
      outcome: 'failed',
      attemptStatus: 'failed',
      failureReason: 'insufficient_funds',
      providerReference: null,
    });
    expect(invoke).toHaveBeenCalledWith('invoice-checkout', {
      body: { action: 'return', params: paymobReturnParams(returnUrl) },
    });
  });

  it('never treats an unsigned or unknown answer as a result', () => {
    expect(parseCheckoutReturnResponse({ status: 'unverified' })).toEqual({ kind: 'unverified' });
    expect(parseCheckoutReturnResponse(null)).toEqual({ kind: 'unverified' });
  });

  it("passes on a forged result's refusal", async () => {
    const context = new Response(JSON.stringify({ error: 'payment_return_invalid' }), { status: 400 });
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });
    const failure = await verifyCheckoutReturn({ hmac: 'forged' }).catch((error: unknown) => error);
    expect(paymentError(failure).key).toBe('payment.errors.payment_return_invalid');
  });
});
