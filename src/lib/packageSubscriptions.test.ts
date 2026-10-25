// The packages page's subscriptions card: totals, each package's numbers (packages nobody took
// included), which subscriptions each number lists, where each one's money stands, and the filters.
import { describe, expect, it } from 'vitest';

import {
  byPackage,
  filterSubscriptions,
  hasFilters,
  NO_FILTERS,
  paymentState,
  rowsForTile,
  sortSubscriptions,
  summarize,
  type SubscriptionRow,
} from './packageSubscriptions';

function sub(id: string, patch: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    kind: 'tuition', subscription_id: id, package_id: 'full', package_name_ar: 'يوم كامل', package_name_en: 'Full day',
    child_id: `child-${id}`, child_name_ar: null, child_name_en: id, class_name_ar: null, class_name_en: null,
    parent_id: `parent-${id}`, parent_name_ar: null, parent_name_en: `Parent ${id}`, parent_phone: null,
    billing_period: 'monthly', duration_months: 1, price: 3000, included_hours: null, hours_used: null,
    status: 'active', started_on: '2026-09-01', ended_on: null, invoiced: true, invoices: 1,
    billed: 0, paid: 0, awaiting: 0, unpaid: 0, overdue: 0, next_due_date: null,
    ...patch,
  };
}

const rows = [
  sub('Laila', { billed: 6000, paid: 3000, awaiting: 1000, unpaid: 2000, overdue: 2000, parent_id: 'mona' }),
  sub('Adam', { billed: 3000, paid: 3000, parent_id: 'mona', billing_period: 'annual' }),
  sub('Omar', { billed: 6000, paid: 2500, unpaid: 3500, status: 'cancelled', parent_id: 'karim' }),
  sub('Sara', { billed: 1500.1, awaiting: 1500.1, package_id: 'half', package_name_en: 'Half day' }),
  sub('Zain', { kind: 'extra_hours', package_id: 'ten', package_name_en: '10 hours', invoiced: false, billing_period: null }),
];
const ids = (list: SubscriptionRow[]) => list.map((row) => row.subscription_id);

describe('where the money stands', () => {
  it('by the most pressing part', () => {
    expect(rows.map(paymentState)).toEqual(['overdue', 'paid', 'unpaid', 'awaiting', 'not_invoiced']);
    expect(paymentState(sub('Quiet'))).toBe('nothing_due');
  });

  it('the totals add up, children and parents counted once', () => {
    expect(summarize(rows)).toEqual({
      subscriptions: 5, active: 4, children: 5, parents: 4,
      billed: 16500.1, paid: 8500, awaiting: 2500.1, unpaid: 5500, overdue: 2000, notInvoiced: 1,
    });
  });
});

describe('each package', () => {
  it('lists every package of the catalogue, also those nobody took, then any others', () => {
    const summaries = byPackage(rows, [
      { id: 'ten', kind: 'extra_hours', name_ar: null, name_en: '10 hours', active: true },
      { id: 'full', kind: 'tuition', name_ar: null, name_en: 'Full day', active: true },
      { id: 'empty', kind: 'tuition', name_ar: null, name_en: 'Weekends', active: false },
    ]);
    expect(summaries.map((s) => `${s.nameEn}:${s.subscriptions}/${s.children}/${s.parents}:${s.paid}`)).toEqual([
      'Full day:3/3/2:8500',
      'Weekends:0/0/0:0',
      'Half day:1/1/1:0',
      '10 hours:1/1/1:0',
    ]);
    expect(summaries.find((s) => s.packageId === 'half')?.offered).toBe(false);
  });
});

describe('the lists behind the numbers', () => {
  it('each number lists the subscriptions it adds up', () => {
    expect(ids(rowsForTile('subscriptions', rows))).toEqual(['Laila', 'Adam', 'Omar', 'Sara', 'Zain']);
    expect(ids(rowsForTile('paid', rows))).toEqual(['Laila', 'Adam', 'Omar']);
    expect(ids(rowsForTile('awaiting', rows))).toEqual(['Laila', 'Sara']);
    expect(ids(rowsForTile('unpaid', rows))).toEqual(['Laila', 'Omar']);
    expect(ids(rowsForTile('billed', rows))).toEqual(['Laila', 'Adam', 'Omar', 'Sara']);
    expect(ids(rowsForTile('package:half', rows))).toEqual(['Sara']);
  });

  it('filters by name, package, status, money and billing period', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(ids(filterSubscriptions(rows, { ...NO_FILTERS, search: 'parent lai' }))).toEqual(['Laila']);
    expect(ids(filterSubscriptions(rows, { ...NO_FILTERS, packageId: 'full' }))).toEqual(['Laila', 'Adam', 'Omar']);
    expect(ids(filterSubscriptions(rows, { ...NO_FILTERS, status: 'ended' }))).toEqual(['Omar']);
    expect(ids(filterSubscriptions(rows, { ...NO_FILTERS, status: 'active', payment: 'awaiting' }))).toEqual(['Sara']);
    expect(ids(filterSubscriptions(rows, { ...NO_FILTERS, payment: 'not_invoiced' }))).toEqual(['Zain']);
    expect(ids(filterSubscriptions(rows, { ...NO_FILTERS, billingPeriod: 'annual' }))).toEqual(['Adam']);
    expect(hasFilters({ ...NO_FILTERS, status: 'ended' })).toBe(true);
  });

  it('sorts by money, dates and names', () => {
    expect(ids(sortSubscriptions(rows, 'unpaid', 'desc', 'en'))).toEqual(['Omar', 'Laila', 'Adam', 'Sara', 'Zain']);
    expect(ids(sortSubscriptions(rows, 'child', 'asc', 'en'))).toEqual(['Adam', 'Laila', 'Omar', 'Sara', 'Zain']);
    expect(ids(sortSubscriptions(rows, 'package', 'asc', 'en'))).toEqual(['Zain', 'Adam', 'Laila', 'Omar', 'Sara']);
  });
});
