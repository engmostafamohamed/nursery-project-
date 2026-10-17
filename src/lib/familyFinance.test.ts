// Family financial history: paid and owed from real payments, per-child splits, and the state of
// every late-pickup day.
import { describe, expect, it } from 'vitest';

import {
  extraHoursDayStatus,
  FAMILY_BUCKET,
  paidPortion,
  summarizeByChild,
  summarizeByType,
  summarizeExtraHours,
  summarizeInvoices,
  type ExtraHoursDay,
  type FinanceInvoice,
} from './familyFinance';

const invoice = (overrides: Partial<FinanceInvoice>): FinanceInvoice => ({
  amount: 100,
  paidAmount: 0,
  balance: 100,
  inReview: false,
  status: 'pending',
  type: 'monthly',
  childIds: [],
  ...overrides,
});

describe('invoice totals', () => {
  it('counts what was actually paid and what is still owed, not whole invoice amounts', () => {
    const rows = [
      invoice({ amount: 1000, paidAmount: 400, balance: 600 }),
      invoice({ amount: 500, paidAmount: 500, balance: 0, status: 'paid' }),
      invoice({ amount: 300, status: 'cancelled', balance: 0 }),
      invoice({ amount: 200, balance: 200, inReview: true, status: 'overdue' }),
    ];
    expect(summarizeInvoices(rows)).toEqual({ invoiceCount: 3, invoiced: 1700, paid: 900, outstanding: 800, inReviewCount: 1 });
  });

  it('treats an invoice marked paid without a payment row as fully paid', () => {
    expect(paidPortion({ amount: 250, paidAmount: 0, status: 'paid' })).toBe(250);
    expect(paidPortion({ amount: 250, paidAmount: 0, status: 'cancelled' })).toBe(0);
  });

  it('splits a shared invoice between its children and keeps unlinked ones as family charges', () => {
    const rows = [
      invoice({ amount: 300, balance: 300, childIds: ['a'] }),
      invoice({ amount: 100, balance: 100, childIds: ['a', 'b'], type: 'event' }),
      invoice({ amount: 50, paidAmount: 50, balance: 0, status: 'paid' }),
    ];
    const byChild = summarizeByChild(rows);
    expect(byChild.get('a')).toMatchObject({ invoiced: 350, outstanding: 350, invoiceCount: 2 });
    expect(byChild.get('b')).toMatchObject({ invoiced: 50, outstanding: 50, invoiceCount: 1 });
    expect(byChild.get(FAMILY_BUCKET)).toMatchObject({ invoiced: 50, paid: 50, outstanding: 0 });
    expect(summarizeByType(rows).get('event')).toMatchObject({ invoiced: 100 });
  });

  it("gives one child's view the same totals as that child's card", () => {
    const rows = [
      invoice({ amount: 300, balance: 300, childIds: ['a'] }),
      invoice({ amount: 100, paidAmount: 100, balance: 0, status: 'paid', childIds: ['a', 'b'], type: 'event' }),
    ];
    const share = (row: FinanceInvoice) => (row.childIds.length > 1 ? 1 / row.childIds.length : 1);
    const childRows = rows.filter((row) => row.childIds.includes('a'));
    expect(summarizeInvoices(childRows, share)).toEqual(summarizeByChild(rows).get('a'));
    expect(summarizeByType(childRows, share).get('event')).toMatchObject({ invoiced: 50, paid: 50 });
  });
});

describe('extra hours days', () => {
  it('names each late day by what happened to its fee', () => {
    const base = { fee: 70, coveredHours: 0, invoiceId: 'inv', invoiceStatus: 'pending', inReview: false };
    expect(extraHoursDayStatus({ ...base, fee: 0, coveredHours: 2 })).toBe('covered');
    expect(extraHoursDayStatus({ ...base, fee: 0 })).toBe('no_charge');
    expect(extraHoursDayStatus({ ...base, invoiceId: null, invoiceStatus: null })).toBe('not_invoiced');
    expect(extraHoursDayStatus(base)).toBe('unpaid');
    expect(extraHoursDayStatus({ ...base, inReview: true })).toBe('in_review');
    expect(extraHoursDayStatus({ ...base, invoiceStatus: 'overdue' })).toBe('unpaid');
    expect(extraHoursDayStatus({ ...base, invoiceStatus: 'paid' })).toBe('paid');
    expect(extraHoursDayStatus({ ...base, invoiceStatus: 'cancelled' })).toBe('cancelled');
  });

  it('adds up hours, package cover and fees by state', () => {
    const day = (overrides: Partial<ExtraHoursDay>): ExtraHoursDay => ({
      attendanceId: 'x', childId: 'a', date: '2026-10-01', hours: 1, coveredHours: 0, billedHours: 1, fee: 70,
      invoiceId: 'i', invoiceNumber: 'INV-1', status: 'unpaid', ...overrides,
    });
    const summary = summarizeExtraHours([
      day({ hours: 2, coveredHours: 2, billedHours: 0, fee: 0, status: 'covered' }),
      day({ status: 'paid' }),
      day({ status: 'unpaid' }),
      day({ status: 'in_review' }),
      day({ status: 'not_invoiced', invoiceId: null }),
      day({ status: 'cancelled' }),
    ]);
    expect(summary).toEqual({
      days: 6, hours: 7, coveredHours: 2, billedHours: 4, fees: 280, paid: 70, unpaid: 140, inReview: 70, notInvoiced: 70,
    });
  });
});
