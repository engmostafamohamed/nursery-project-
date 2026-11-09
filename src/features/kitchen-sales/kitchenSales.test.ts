import { describe, expect, it } from 'vitest';

import { invoiceItemDescription } from '@/lib/invoiceItems';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import {
  allergyConflicts,
  bestDiscount,
  canCancelCharge,
  chargePreview,
  discountIssues,
  discountLive,
  discounted,
  filterCharges,
  orderIssues,
  packsToUnits,
  preApproved,
  quantityIssue,
  salesTotals,
  sortRequests,
  toClassExtras,
  toFamilyExtras,
  toKitchenSales,
  toMyKitchenAccount,
  type KitchenCharge,
  type KitchenDiscount,
} from './kitchenSales';
import { kitchenErrorKey } from './kitchenSalesApi';

const today = '2026-11-09';

describe('prices', () => {
  it('apply a discount to the piastre and split a taking into price, discount and charge', () => {
    expect(discounted(10, 10)).toBe(9);
    expect(discounted(7.5, 33.33)).toBe(5);
    expect(chargePreview(5, 2, 50)).toEqual({ gross: 10, discount: 5, net: 5 });
    expect(chargePreview(3.35, 3, 0)).toEqual({ gross: 10.05, discount: 0, net: 10.05 });
    expect(packsToUnits(10, 12)).toBe(120);
    expect(packsToUnits(2.5, null)).toBe(2.5);
  });

  it('check a quantity against the stock', () => {
    expect(quantityIssue('', 5)).toBe('required');
    expect(quantityIssue('1.234', 5)).toBe('invalid');
    expect(quantityIssue('0', 5)).toBe('zero');
    expect(quantityIssue('11', 50, 10)).toBe('too_many');
    expect(quantityIssue('6', 5)).toBe('more_than_stock');
    expect(quantityIssue('5', 5)).toBeNull();
  });
});

describe('discounts', () => {
  const d = (patch: Partial<KitchenDiscount>): KitchenDiscount => ({
    id: 'd', nameAr: '', nameEn: 'D', audience: 'all_staff', personId: null, personAr: null, personEn: null, itemId: null, itemName: null,
    percent: 10, startsOn: null, endsOn: null, active: true, ...patch,
  });

  it('pick the best one that applies, as the database does', () => {
    const list = [
      d({ id: 'staff', audience: 'all_staff', percent: 50 }),
      d({ id: 'sara', audience: 'staff_member', personId: 'sara', percent: 70, endsOn: '2026-11-08' }),
      d({ id: 'laila-juice', audience: 'child', personId: 'laila', itemId: 'juice', percent: 10 }),
      d({ id: 'kids', audience: 'all_children', percent: 5 }),
      d({ id: 'off', audience: 'all_children', percent: 90, active: false }),
    ];
    expect(bestDiscount(list, { itemId: 'water', consumer: 'staff', personId: 'sara' }, today)?.id).toBe('staff');
    expect(bestDiscount(list, { itemId: 'juice', consumer: 'child', personId: 'laila' }, today)?.id).toBe('laila-juice');
    expect(bestDiscount(list, { itemId: 'water', consumer: 'child', personId: 'laila' }, today)?.id).toBe('kids');
    expect(bestDiscount([], { itemId: 'water', consumer: 'child', personId: 'laila' }, today)).toBeNull();
    expect(discountLive(d({ startsOn: '2026-11-10' }), today)).toBe(false);
  });

  it('are checked before saving', () => {
    const draft = { nameAr: 'خصم', nameEn: 'Staff', audience: 'all_staff' as const, personId: '', itemId: '', percent: '50', startsOn: '', endsOn: '', active: true };
    expect(discountIssues(draft)).toEqual({});
    expect(discountIssues({ ...draft, nameAr: ' ', audience: 'child', percent: '101', startsOn: '2026-11-10', endsOn: '2026-11-09' })).toEqual({
      nameAr: 'name_required', personId: 'person_required', percent: 'percent_invalid', endsOn: 'ends_before_start',
    });
  });
});

describe('charges', () => {
  const c = (patch: Partial<KitchenCharge>): KitchenCharge => ({
    id: 'c', itemName: 'Juice', unit: 'box', consumer: 'child', personId: 'p', nameAr: 'ليلى', nameEn: 'Laila', classAr: null, classEn: null,
    quantity: 1, unitPrice: 10, gross: 10, discountNameAr: null, discountNameEn: null, discountPercent: 0, discountAmount: 0, net: 10,
    chargedOn: today, createdAt: '', billing: 'invoiced', cancelReason: null, fromRequest: false, byAr: '', byEn: '', ...patch,
  });

  it('total the month, leaving cancelled ones out', () => {
    const list = [
      c({ net: 9, gross: 10, discountAmount: 1 }),
      c({ consumer: 'staff', nameEn: 'Sara', net: 5, gross: 10, discountAmount: 5, billing: 'open' }),
      c({ consumer: 'staff', net: 4, gross: 4, billing: 'deducted' }),
      c({ net: 100, gross: 100, billing: 'cancelled' }),
    ];
    expect(salesTotals(list)).toEqual({ count: 3, gross: 24, discount: 6, net: 18, children: 9, staff: 9, staffOpen: 5 });
    expect(filterCharges(list, 'staff', 'sara').length).toBe(1);
    expect(filterCharges(list, 'all', 'juice').length).toBe(4);
  });

  it('can be cancelled only before they are paid or deducted', () => {
    expect(['open', 'invoiced', 'no_parent'].every((b) => canCancelCharge({ billing: b as KitchenCharge['billing'] }))).toBe(true);
    expect(['paid', 'deducted', 'cancelled'].some((b) => canCancelCharge({ billing: b as KitchenCharge['billing'] }))).toBe(false);
  });
});

describe('extras', () => {
  it('follow the enrollment consent and refuse allergens', () => {
    expect(preApproved('snack', { meals: false, snacks: true })).toBe(true);
    expect(preApproved('drink', { meals: false, snacks: true })).toBe(true);
    expect(preApproved('meal', { meals: false, snacks: true })).toBe(false);
    expect(allergyConflicts(['milk', 'eggs', 'odd'], ['eggs', 'fish'])).toEqual(['eggs']);
  });

  it('list what waits for the parent first, then what is coming, then the rest', () => {
    const r = (id: string, status: string, forDate: string) => ({ id, status: status as 'served', forDate });
    expect(sortRequests([r('old', 'served', '2026-11-01'), r('soon', 'approved', '2026-11-12'), r('now', 'approved', '2026-11-09'), r('ask', 'waiting_parent', '2026-11-09'), r('new', 'expired', '2026-11-05')]).map((x) => x.id))
      .toEqual(['ask', 'now', 'soon', 'new', 'old']);
  });

  it('check an order', () => {
    expect(orderIssues({ itemId: '', quantity: '0', dates: [], note: 'x'.repeat(201) })).toEqual({ itemId: 'item_required', quantity: 'quantity_invalid', dates: 'dates_required', note: 'note_too_long' });
    expect(orderIssues({ itemId: 'i', quantity: '2', dates: [today], note: '' })).toEqual({});
  });
});

describe('reading the database', () => {
  it('maps every answer defensively', () => {
    const sales = toKitchenSales({ today, month: '2026-11', charges: [{ id: 'c', consumer: 'staff', billing: 'weird', net: '5.00', discount_amount: '5' }],
      discounts: [{ id: 'd', audience: 'nope', percent: '50' }], requests_today: [{ id: 'r', status: 'approved', child_id: 'k', quantity: 1 }], staff_open: [{ id: 's', open: '10' }] });
    expect(sales.charges[0]).toMatchObject({ consumer: 'staff', billing: 'open', net: 5, discountAmount: 5 });
    expect(sales.discounts[0]).toMatchObject({ audience: 'all_children', percent: 50 });
    expect(sales.requestsToday[0]).toMatchObject({ status: 'approved', forDate: today, childId: 'k' });
    expect(sales.staffOpen[0].open).toBe(10);

    const family = toFamilyExtras([{ child_id: 'k', open_days: ['2026-11-09', '2026-11-10'], accepts_snacks: true,
      extras: [{ id: 'i', kind: 'drink', price: '10', final_price: '9', conflicts: ['milk', 'x'], in_stock: true }], requests: [{ id: 'r', status: 'bogus' }] }]);
    expect(family[0]).toMatchObject({ consent: { meals: false, snacks: true }, openDays: ['2026-11-09', '2026-11-10'] });
    expect(family[0].extras[0]).toMatchObject({ kind: 'drink', price: 10, finalPrice: 9, conflicts: ['milk'] });
    expect(family[0].requests[0].status).toBe('expired');

    const classes = toClassExtras({ today, children: [{ child_id: 'k', here: true }], items: [], allergies: { k: ['milk'] } });
    expect(classes.children[0]).toMatchObject({ here: true, allergens: ['milk'] });

    const mine = toMyKitchenAccount({ open_total: '12.5', charges: [{ id: 'c', billing: 'deducted', payslip_month: '2026-11' }], items: [] });
    expect(mine).toMatchObject({ openTotal: 12.5, payslipMonths: { c: '2026-11' } });
    expect(mine.charges[0].consumer).toBe('staff');
  });

  it('names what went wrong', () => {
    expect(kitchenErrorKey({ message: 'kitchen_allergy' })).toBe('kitchenSales.errors.kitchen_allergy');
    expect(kitchenErrorKey({ message: 'Failed to fetch' })).toBe('kitchenSales.errors.network');
    expect(kitchenErrorKey(null)).toBe('kitchenSales.errors.failed');
  });
});

describe('the food invoice', () => {
  it('says what each line is and the discount that explains its total', () => {
    expect(invoiceItemDescription({ kind: 'food_extra', name_en: 'Juice', date: '2026-11-09' }, 'en')).toBe('Juice · 9 Nov 2026');
    expect(invoiceItemDescription({ kind: 'food_extra', name_en: 'Juice', date: '2026-11-09', discount_amount: 1, discount_name_en: 'Laila juice', discount_percent: 10 }, 'en'))
      .toBe('Juice · 9 Nov 2026 · Laila juice −10%');
  });
});

describe('texts', () => {
  it('exist in both languages for every state, kind and error', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    const keys = [
      ...['open', 'deducted', 'invoiced', 'paid', 'no_parent', 'cancelled'].map((k) => `kitchenSales.billing.${k}`),
      ...['waiting_parent', 'approved', 'declined', 'served', 'cancelled', 'expired'].map((k) => `kitchenSales.extras.statuses.${k}`),
      ...['meal', 'drink', 'snack'].map((k) => `kitchenSales.kinds.${k}`),
      ...['all_staff', 'all_children', 'staff_member', 'child'].map((k) => `kitchenSales.discounts.audiences.${k}`),
      ...['stock', 'sales', 'extras', 'discounts'].map((k) => `kitchenSales.page.tab.${k}`),
      ...['required', 'invalid', 'zero', 'too_many', 'more_than_stock'].map((k) => `kitchenSales.quantityIssues.${k}`),
      ...['kitchen_forbidden', 'kitchen_not_enough', 'kitchen_not_for_sale', 'kitchen_allergy', 'kitchen_invalid_quantity', 'kitchen_invalid_dates', 'kitchen_request_closed',
        'kitchen_charge_settled', 'kitchen_reason_required', 'kitchen_discount_invalid', 'network', 'failed'].map((k) => `kitchenSales.errors.${k}`),
      ...['staff', 'child', 'staffNotSold', 'childNotSold'].map((k) => `kitchenSales.charge.${k}`),
      ...['extra_served', 'extra_needs_approval', 'extra_approved', 'extra_declined', 'extra_ordered'].flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
      ...['price_invalid', 'pack_invalid', 'pack_unit_required', 'extra_needs_price'].map((k) => `fnb.kitchen.issues.${k}`),
      'fnb.kitchen.kinds.charged', 'fnb.kitchen.kinds.returned', 'invoice.types.food_extras', 'invoice.filters.types.food_extras',
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
  });
});
