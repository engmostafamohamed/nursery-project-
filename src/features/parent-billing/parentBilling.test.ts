import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import {
  amountPolicyOf,
  billingSummary,
  invoiceState,
  isPayable,
  localName,
  partAmountError,
  payFlowSteps,
  pointsDiscount,
  pointsError,
  pointsLimits,
  type BillingInvoice,
  type InvoiceState,
} from './parentBilling';
import { toBillingInvoice, toBillingInvoiceDetails } from './parentBillingApi';

const invoice = (patch: Partial<BillingInvoice>): BillingInvoice => ({
  id: 'i',
  nurseryId: 'n',
  invoiceNumber: 'INV-1',
  amount: 1000,
  type: 'monthly',
  status: 'pending',
  dueDate: '2026-11-10',
  createdAt: '2026-11-01T08:00:00Z',
  paidAt: null,
  paymentMethod: null,
  lineItems: [],
  paidAmount: 0,
  pendingAmount: 0,
  payable: 1000,
  overdueDays: 0,
  applicationId: null,
  childIds: [],
  ...patch,
});

describe('an invoice as the parent reads it', () => {
  it('is paid, cancelled, waiting for the nursery, overdue or to pay', () => {
    expect(invoiceState(invoice({ status: 'paid', payable: 0 }))).toBe('paid');
    expect(invoiceState(invoice({ status: 'cancelled', payable: 0 }))).toBe('cancelled');
    // Everything left was sent: nothing to pay, only to wait for.
    expect(invoiceState(invoice({ payable: 0, pendingAmount: 1000 }))).toBe('in_review');
    expect(invoiceState(invoice({ status: 'overdue', payable: 0, pendingAmount: 1000 }))).toBe('in_review');
    // Part sent, part still to pay: it still asks for payment.
    expect(invoiceState(invoice({ status: 'overdue', payable: 400, pendingAmount: 600 }))).toBe('overdue');
    expect(invoiceState(invoice({}))).toBe('due');
  });

  it('can be paid only while open with something left', () => {
    expect(isPayable(invoice({}))).toBe(true);
    expect(isPayable(invoice({ status: 'overdue', payable: 10 }))).toBe(true);
    expect(isPayable(invoice({ payable: 0, pendingAmount: 1000 }))).toBe(false);
    expect(isPayable(invoice({ status: 'paid', payable: 0 }))).toBe(false);
    expect(isPayable(invoice({ status: 'cancelled', payable: 0 }))).toBe(false);
  });

  it('is paid in one payment when it is an admission invoice', () => {
    expect(amountPolicyOf(invoice({ applicationId: 'a1' }))).toBe('full');
    expect(amountPolicyOf(invoice({}))).toBe('flexible');
  });
});

describe('what the parent owes', () => {
  it('adds up what can be paid now, the overdue part and what waits for the nursery', () => {
    const summary = billingSummary([
      invoice({ id: 'late-old', status: 'overdue', dueDate: '2026-09-05', payable: 3750, overdueDays: 60 }),
      invoice({ id: 'late-part', status: 'overdue', dueDate: '2026-10-05', payable: 400.5, pendingAmount: 600, overdueDays: 30 }),
      invoice({ id: 'next', dueDate: '2026-11-20', payable: 1000 }),
      invoice({ id: 'sent', payable: 0, pendingAmount: 500, dueDate: '2026-11-25' }),
      invoice({ id: 'paid', status: 'paid', payable: 0, paidAmount: 900 }),
      invoice({ id: 'gone', status: 'cancelled', payable: 0, pendingAmount: 0 }),
    ]);
    expect(summary).toMatchObject({
      owed: 5150.5,
      owedCount: 3,
      overdue: 4150.5,
      overdueCount: 2,
      inReview: 1100,
      inReviewCount: 2,
      paidCount: 1,
    });
    // The pay button goes to the oldest overdue invoice first.
    expect(summary.next?.id).toBe('late-old');
  });

  it('has nothing to pay when everything is paid or sent', () => {
    const summary = billingSummary([invoice({ payable: 0, pendingAmount: 1000 }), invoice({ status: 'paid', payable: 0 })]);
    expect(summary.owed).toBe(0);
    expect(summary.next).toBeNull();
    expect(summary.inReview).toBe(1000);
    expect(billingSummary([]).next).toBeNull();
  });
});

describe('a part payment the parent types', () => {
  it('must be a positive amount in piastres, up to what is left', () => {
    expect(partAmountError('', 1000)).toBe('required');
    expect(partAmountError('  ', 1000)).toBe('required');
    expect(partAmountError('12a', 1000)).toBe('invalid');
    expect(partAmountError('10.555', 1000)).toBe('invalid');
    expect(partAmountError('0', 1000)).toBe('too_small');
    expect(partAmountError('1000.01', 1000)).toBe('too_large');
    expect(partAmountError('1000', 1000)).toBeNull();
    expect(partAmountError('250.5', 1000)).toBeNull();
  });
});

describe('points on an invoice', () => {
  const offer = { enabled: true, rate: 0.1, balance: 22725, minPoints: 100, maxDiscount: 1875 };

  it('are limited by the balance and by what the invoice can still lose', () => {
    expect(pointsLimits(offer)).toEqual({ usable: true, minPoints: 100, maxPoints: 18750, rate: 0.1 });
    expect(pointsLimits({ ...offer, balance: 500 }).maxPoints).toBe(500);
    // Less than the smallest redemption left to use: the step is not offered.
    expect(pointsLimits({ ...offer, maxDiscount: 5 }).usable).toBe(false);
    expect(pointsLimits({ ...offer, balance: 99 }).usable).toBe(false);
    expect(pointsLimits({ ...offer, enabled: false }).usable).toBe(false);
    expect(pointsLimits(null).usable).toBe(false);
  });

  it('are checked as the server checks them', () => {
    const limits = pointsLimits(offer);
    expect(pointsError(99, limits)).toBe('below_minimum');
    expect(pointsError(18751, limits)).toBe('above_maximum');
    expect(pointsError(150.5, limits)).toBe('whole_number');
    expect(pointsError(100, limits)).toBeNull();
    expect(pointsDiscount(18750, 0.1)).toBe(1875);
    expect(pointsDiscount(333, 0.1)).toBe(33.3);
  });

  it('add a step only when some can be used', () => {
    expect(payFlowSteps(true)).toEqual(['amount', 'points', 'method', 'confirm']);
    expect(payFlowSteps(false)).toEqual(['amount', 'method', 'confirm']);
  });
});

describe('reading the server rows', () => {
  it('turns get_parent_billing rows into invoices, with safe defaults', () => {
    const row = toBillingInvoice({
      id: 'x', nursery_id: 'n', invoice_number: 'INV-9', amount: 3750, type: 'monthly', status: 'overdue',
      due_date: '2026-11-04', created_at: '2026-11-01T06:00:00Z', paid_at: null, payment_method: null,
      line_items: [{ kind: 'tuition' }], paid_amount: 0, pending_amount: '250.00', payable: 3500, overdue_days: 4,
      application_id: null, child_ids: ['c1', 7],
    });
    expect(row).toMatchObject({ amount: 3750, status: 'overdue', pendingAmount: 250, payable: 3500, overdueDays: 4, childIds: ['c1'] });
    expect(toBillingInvoice({ type: 'weird', status: 'odd' })).toMatchObject({ type: 'other', status: 'pending', amount: 0, childIds: [] });
  });

  it('reads one invoice with its payments, what waits for the nursery and the points offer', () => {
    const details = toBillingInvoiceDetails({
      id: 'x', amount: 1000, status: 'pending', payable: 400,
      parent: { name_ar: 'منى', name_en: 'Mona' },
      children: [{ id: 'c1', name_ar: 'ليلى', name_en: 'Laila' }],
      payments: [{ id: 'p1', amount: 100, method: 'cash', paid_at: '2026-11-02T10:00:00Z' }],
      in_review: [{ id: 'a1', amount: 500, method: 'instapay', created_at: '2026-11-03T10:00:00Z' }],
      reminders: [{ type: 'invoice_due_reminder', sent_at: '2026-11-04T09:00:00Z' }],
      loyalty: { enabled: true, rate: 0.1, balance: 300, min_points: 100, max_discount: 400 },
    });
    expect(details.parent.name_en).toBe('Mona');
    expect(details.payments[0]).toEqual({ id: 'p1', amount: 100, method: 'cash', at: '2026-11-02T10:00:00Z' });
    expect(details.inReview[0]).toEqual({ id: 'a1', amount: 500, method: 'instapay', at: '2026-11-03T10:00:00Z' });
    expect(details.loyalty).toEqual({ enabled: true, rate: 0.1, balance: 300, minPoints: 100, maxDiscount: 400 });
    expect(toBillingInvoiceDetails({}).loyalty.enabled).toBe(false);
  });

  it('names a child in the reader language, falling back to the other', () => {
    expect(localName({ name_ar: 'ليلى', name_en: 'Laila' }, true)).toBe('ليلى');
    expect(localName({ name_ar: '', name_en: 'Laila' }, true)).toBe('Laila');
    expect(localName({ name_ar: 'ليلى', name_en: null }, false)).toBe('ليلى');
  });
});

describe('texts built at run time', () => {
  const lookup = (dict: unknown, key: string) =>
    key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
  const states: InvoiceState[] = ['paid', 'in_review', 'overdue', 'due', 'cancelled'];
  const keys = [
    ...states.map((s) => `parentBilling.state.${s}`),
    ...['amount', 'points', 'method', 'confirm'].flatMap((s) => [`parentBilling.pay.steps.${s}`, `parentBilling.pay.titles.${s}`]),
    ...['required', 'invalid', 'too_small', 'too_large'].map((e) => `parentBilling.pay.partErrors.${e}`),
    ...['whole_number', 'below_minimum', 'above_maximum'].map((e) => `parentBilling.points.errors.${e}`),
    ...['sent', 'already_sent', 'waiting', 'paid_with_points', 'paid', 'cancelled'].flatMap((k) => [
      `parentBilling.outcome.${k}.title`,
      `parentBilling.outcome.${k}.body`,
    ]),
    ...['all', 'open', 'paid'].map((f) => `parentBilling.list.filters.${f}`),
  ];

  it.each(keys)('%s exists in English and Arabic', (key) => {
    expect(typeof lookup(en, key)).toBe('string');
    expect(typeof lookup(ar, key)).toBe('string');
  });

  it('the counts have every Arabic plural form', () => {
    for (const key of ['parentBilling.hero.overdue', 'parentBilling.list.lateDays']) {
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) expect(typeof lookup(ar, `${key}_${form}`), `${key}_${form}`).toBe('string');
    }
  });
});
