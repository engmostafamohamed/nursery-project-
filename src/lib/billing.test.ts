// Module 7 · Billing, payments & finance — invoice lines, payments and the financial dashboard helpers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';
import { fakeDb } from '@/test/fakeSupabase';

import {
  bucketPaymentMethod,
  csvEscapeCell,
  lastSixMonthBuckets,
  monthKeyFromRange,
  paidOnOrBeforeDueDate,
  paymentMatchesMethodFilter,
  pickParentDisplayName,
  previousIsoRange,
  rangeForPreset,
} from './financialDashboardHelpers';
import { invoiceItemDescription, invoiceNotes, invoiceRawItems } from './invoiceItems';
import {
  enabledManualMethods,
  isParentPaymentMethodCode,
  methodNeedsReference,
  paymentError,
  recordInvoicePayment,
  redeemLoyaltyPoints,
  submitInvoicePayment,
} from './paymentApi';

vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));

describe('invoiceItemDescription', () => {
  it('labels a loyalty discount with its points, in each language', () => {
    const item = { kind: 'loyalty_discount', points: 120 };
    expect(invoiceItemDescription(item, 'en')).toBe('Loyalty points discount (120 points)');
    expect(invoiceItemDescription(item, 'ar')).toBe('خصم نقاط الولاء (120 نقطة)');
  });

  it('labels a late pickup with its date', () => {
    const text = invoiceItemDescription({ kind: 'late_pickup', attendance_date: '2026-10-05' }, 'en');
    expect(text).toBe('Late pickup extra hours · 5 Oct 2026');
  });

  it('prefers the stored name in the requested language, then the other one', () => {
    const item = { kind: 'tuition', name_ar: 'رسوم أكتوبر', name_en: 'October tuition' };
    expect(invoiceItemDescription(item, 'en')).toBe('October tuition');
    expect(invoiceItemDescription(item, 'ar')).toBe('رسوم أكتوبر');
    expect(invoiceItemDescription({ kind: 'tuition', name_ar: 'رسوم أكتوبر' }, 'en')).toBe('رسوم أكتوبر');
  });

  it('falls back to the translated kind when a system line has no name', () => {
    expect(invoiceItemDescription({ kind: 'tuition' }, 'en')).toBe('Tuition');
    expect(invoiceItemDescription({ kind: 'event' }, 'ar')).toBe('فعالية');
  });

  it('keeps what an admin typed on a manual line', () => {
    expect(invoiceItemDescription({ description: 'Uniform', description_ar: 'زي' }, 'en')).toBe('Uniform');
    expect(invoiceItemDescription({ description: 'Uniform', description_ar: 'زي' }, 'ar')).toBe('زي');
  });

  it('treats any non-English language as Arabic', () => {
    expect(invoiceItemDescription({ kind: 'discount' }, 'fr')).toBe('خصم');
  });
});

describe('invoiceNotes', () => {
  it('returns the note an admin wrote', () => {
    expect(invoiceNotes({ notes: '  Paid in two parts ' }, 'en')).toBe('Paid in two parts');
  });

  it('explains an admission-package invoice that has no note', () => {
    expect(invoiceNotes({ application_payment: true }, 'en')).toBe('Admission package selected before approval.');
  });

  it('returns nothing for missing or malformed data', () => {
    expect(invoiceNotes(null)).toBe('');
    expect(invoiceNotes(['not', 'an', 'object'])).toBe('');
  });
});

describe('invoiceRawItems', () => {
  it('reads both the bare-array and the { items } shapes', () => {
    expect(invoiceRawItems([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(invoiceRawItems({ items: [{ b: 2 }] })).toEqual([{ b: 2 }]);
  });

  it('drops anything that is not a line object', () => {
    expect(invoiceRawItems([{ a: 1 }, null, 'x', [1], 3])).toEqual([{ a: 1 }]);
    expect(invoiceRawItems('garbage')).toEqual([]);
  });
});

describe('payment methods', () => {
  it.each([
    ['cash', 'cash'],
    ['CASH', 'cash'],
    ['bank_transfer', 'bank_transfer'],
    ['card', 'paymob'],
    ['instapay', 'paymob'],
    ['fawry', 'paymob'],
    ['vodafone_cash', 'paymob'],
    ['cheque', 'other'],
    ['', 'other'],
  ] as const)('puts %s in the %s group', (method, bucket) => {
    expect(bucketPaymentMethod(method)).toBe(bucket);
  });

  it('filters by group, and "all" keeps everything', () => {
    expect(paymentMatchesMethodFilter('instapay', 'paymob')).toBe(true);
    expect(paymentMatchesMethodFilter('cash', 'paymob')).toBe(false);
    expect(paymentMatchesMethodFilter('anything', 'all')).toBe(true);
  });
});

describe('paidOnOrBeforeDueDate', () => {
  it('counts a payment on the due day as on time', () => {
    expect(paidOnOrBeforeDueDate('2026-10-10', '2026-10-10T21:30:00Z')).toBe(true);
  });

  it('counts a later payment, or no payment, as late', () => {
    expect(paidOnOrBeforeDueDate('2026-10-10', '2026-10-11T08:00:00Z')).toBe(false);
    expect(paidOnOrBeforeDueDate('2026-10-10', null)).toBe(false);
  });
});

describe('date ranges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0)); // 14 Oct 2026, noon
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('this month runs from the 1st at 00:00 to the last day at 23:59', () => {
    const range = rangeForPreset('this_month')!;
    const from = new Date(range.from);
    const to = new Date(range.to);
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()]).toEqual([2026, 9, 1, 0]);
    expect([to.getMonth(), to.getDate(), to.getHours(), to.getMinutes()]).toEqual([9, 31, 23, 59]);
  });

  it('last month is the whole of September', () => {
    const range = rangeForPreset('last_month')!;
    expect(new Date(range.from).getMonth()).toBe(8);
    expect(new Date(range.from).getDate()).toBe(1);
    expect(new Date(range.to).getDate()).toBe(30);
  });

  it('a custom range needs both dates', () => {
    expect(rangeForPreset('custom', '2026-10-01', '2026-10-07')).toEqual({
      from: '2026-10-01T00:00:00.000',
      to: '2026-10-07T23:59:59.999',
    });
    expect(rangeForPreset('custom', '2026-10-01')).toBeNull();
  });

  it('the previous range has the same length and ends just before', () => {
    const range = { from: '2026-10-08T00:00:00.000Z', to: '2026-10-14T00:00:00.000Z' };
    const previous = previousIsoRange(range);
    expect(new Date(previous.to).getTime()).toBe(new Date(range.from).getTime() - 1);
    expect(new Date(previous.to).getTime() - new Date(previous.from).getTime()).toBe(
      new Date(range.to).getTime() - new Date(range.from).getTime(),
    );
  });

  it('the last six months end with the current month, oldest first', () => {
    const buckets = lastSixMonthBuckets();
    expect(buckets).toHaveLength(6);
    expect(new Date(buckets[0].from).getMonth()).toBe(4); // May
    expect(new Date(buckets[5].from).getMonth()).toBe(9); // October
  });

  it('a month key is the year and month of the range start', () => {
    expect(monthKeyFromRange({ from: '2026-10-01T12:00:00.000Z', to: '2026-10-31T12:00:00.000Z' })).toBe('2026-10');
  });
});

describe('pickParentDisplayName', () => {
  it('follows the nursery language, then falls back', () => {
    expect(pickParentDisplayName('en', 'أحمد', 'Ahmed', '-')).toBe('Ahmed');
    expect(pickParentDisplayName('ar', 'أحمد', 'Ahmed', '-')).toBe('أحمد');
    expect(pickParentDisplayName('en', 'أحمد', null, '-')).toBe('أحمد');
    expect(pickParentDisplayName('both', null, null, 'parent@x.com')).toBe('parent@x.com');
  });
});

describe('csvEscapeCell', () => {
  it('quotes cells with commas, quotes or new lines', () => {
    expect(csvEscapeCell('a,b')).toBe('"a,b"');
    expect(csvEscapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscapeCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves plain cells alone', () => {
    expect(csvEscapeCell('plain')).toBe('plain');
  });
});

describe('payment methods a parent can use', () => {
  it('knows the method codes', () => {
    for (const code of ['instapay', 'vodafone_cash', 'etisalat_cash', 'bank_transfer', 'fawry', 'cash', 'manual', 'card']) {
      expect(isParentPaymentMethodCode(code), code).toBe(true);
    }
    expect(isParentPaymentMethodCode('bitcoin')).toBe(false);
    expect(isParentPaymentMethodCode(undefined)).toBe(false);
  });

  it('asks for a reference number for transfers only', () => {
    expect(methodNeedsReference('instapay')).toBe(true);
    expect(methodNeedsReference('bank_transfer')).toBe(true);
    expect(methodNeedsReference('card')).toBe(false);
    expect(methodNeedsReference('cash')).toBe(false);
  });

  it('offers the manual methods the nursery turned on, never cash', () => {
    expect(enabledManualMethods(['cash', 'fawry_manual', 'instapay', 'paymob'])).toEqual(['instapay', 'fawry']);
    expect(enabledManualMethods(['fawry'])).toEqual([]); // online Fawry is not a manual method
    expect(enabledManualMethods(null)).toEqual(['manual']);
  });
});

describe('payment requests to the server', () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it('sends a parent payment rounded to piastres, with a trimmed reference and the retry key', async () => {
    fakeDb.setRpcResult('submit_invoice_payment', { status: 'submitted', attempt_id: 'a1' });
    const result = await submitInvoicePayment({
      invoiceId: 'inv-1',
      amount: 100.456,
      method: 'instapay',
      reference: '  TX-99  ',
      idempotencyKey: 'key-1',
    });
    expect(result).toEqual({ status: 'submitted', attempt_id: 'a1' });
    expect(fakeDb.queries[0]).toMatchObject({
      table: 'submit_invoice_payment',
      payload: { p_invoice_id: 'inv-1', p_amount: 100.46, p_method: 'instapay', p_reference: 'TX-99', p_proof_url: null, p_idempotency_key: 'key-1' },
    });
  });

  it('records a desk payment with the time in UTC', async () => {
    await recordInvoicePayment({ invoiceId: 'inv-1', amount: 50, method: 'cash', paidAt: '2026-10-14T10:00:00+03:00', idempotencyKey: 'k' });
    expect(fakeDb.queries[0].payload).toMatchObject({ p_paid_at: '2026-10-14T07:00:00.000Z', p_amount: 50 });
  });

  it('redeems whole loyalty points only', async () => {
    await redeemLoyaltyPoints({ invoiceId: 'inv-1', points: 120.9, idempotencyKey: 'k' });
    expect(fakeDb.queries[0].payload).toMatchObject({ p_points: 120 });
  });

  it('passes a server refusal on to the caller', async () => {
    fakeDb.failTable('submit_invoice_payment', 'payment_exceeds_balance', '250');
    await expect(
      submitInvoicePayment({ invoiceId: 'inv-1', amount: 300, method: 'cash', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ message: 'payment_exceeds_balance' });
  });
});

describe('payment error messages', () => {
  const CODES = [
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
  ];

  it.each(CODES)('%s has a message in both languages', (code) => {
    const { key } = paymentError({ message: `ERROR: ${code}` });
    expect(key).toBe(`payment.errors.${code}`);
    expect(i18n.exists(key, { lng: 'en' }) && i18n.exists(key, { lng: 'ar' })).toBe(true);
  });

  it('shows the amount still due when the payment is too large', () => {
    expect(paymentError({ message: 'payment_exceeds_balance', details: '250' })).toEqual({
      key: 'payment.errors.payment_exceeds_balance',
      values: { amount: '250.00' },
    });
  });

  it('shows a general message for anything else', () => {
    expect(paymentError(new Error('network down')).key).toBe('payment.errors.actionFailed');
    expect(paymentError(null).key).toBe('payment.errors.actionFailed');
  });
});
