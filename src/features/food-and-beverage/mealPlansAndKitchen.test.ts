import { describe, expect, it } from 'vitest';

import { ALERT_TYPES, filterAlerts, groupCounts, isFiltered, NO_FILTER } from '@/features/health-alerts/healthAlertsView';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';
import type { HealthAlertItem } from '@/lib/healthAlertsCompute';

import { itemIssues, movementIssue, quantityAfter, sortForAttention, stockFlags, stockTotals, type KitchenItem } from './kitchen';
import { childMatches, isNotBilled, mealPlanIssues, mealPlanTotals, orderedMeals, type MealPlanChild } from './mealPlans';
import { fnbErrorKey, toKitchenData, toMealPlansData } from './mealPlansApi';
import { groupUnmatched } from './menu';

const child = (patch: Partial<MealPlanChild>): MealPlanChild => ({
  childId: 'c', nameAr: 'ليلى', nameEn: 'Laila', classId: null, classNameAr: null, classNameEn: null,
  eatsNurseryMeals: true, hasTuition: true, current: null, ...patch,
});
const plan = (price: number, charged = true) => ({ id: 'p', mealPlanId: 'm', nameAr: '', nameEn: 'Full', meals: ['lunch' as const], monthlyPrice: price, charged, startedOn: '2026-11-08' });

describe('meal plans', () => {
  it('need both names, a meal and a price in piastres', () => {
    expect(mealPlanIssues({ nameAr: '', nameEn: ' ', meals: [], price: 'x', active: true })).toEqual({
      nameAr: 'name_ar_required', nameEn: 'name_en_required', meals: 'meals_required', price: 'price_invalid',
    });
    expect(mealPlanIssues({ nameAr: 'كاملة', nameEn: 'Full', meals: ['lunch'], price: '800.50', active: true })).toEqual({});
    expect(mealPlanIssues({ nameAr: 'كاملة', nameEn: 'Full', meals: ['lunch'], price: '0', active: true })).toEqual({});
    expect(mealPlanIssues({ nameAr: 'x'.repeat(81), nameEn: 'Full', meals: ['lunch'], price: '100001', active: true })).toEqual({ nameAr: 'name_too_long', price: 'price_invalid' });
    expect(orderedMeals(['snacks', 'breakfast', 'other'])).toEqual(['breakfast', 'snacks']);
  });

  it('count what children pay a month, and who would not be billed', () => {
    const children = [
      child({ childId: 'a', current: plan(800) }),
      child({ childId: 'b', current: plan(500) }),
      child({ childId: 'c', current: plan(800, false) }),
      child({ childId: 'd' }),
      child({ childId: 'e', current: plan(600), hasTuition: false }),
    ];
    expect(mealPlanTotals(children)).toEqual({ withPlan: 4, charged: 3, included: 1, none: 1, monthly: 1300, notBilled: 1 });
    expect(children.filter((c) => childMatches(c, 'not_billed')).map((c) => c.childId)).toEqual(['e']);
    expect(children.filter((c) => childMatches(c, 'included')).map((c) => c.childId)).toEqual(['c']);
    expect(children.filter((c) => childMatches(c, 'none')).map((c) => c.childId)).toEqual(['d']);
    expect(isNotBilled(child({ current: plan(0), hasTuition: false }))).toBe(false);
  });

  it('read get_meal_plans', () => {
    const data = toMealPlansData({
      can_edit: true,
      plans: [{ id: 'p1', name_ar: 'كاملة', name_en: 'Full', meals: ['snacks', 'lunch'], monthly_price: '800.00', active: true, children: 3 }],
      children: [{ child_id: 'c1', name_en: 'Laila', has_tuition: true, current: { id: 'x', meal_plan_id: 'p1', name_en: 'Full', meals: ['lunch'], monthly_price: 800, charged: false, started_on: '2026-11-08' } },
                 { child_id: 'c2', name_en: 'Adam', current: null, eats_nursery_meals: false }],
    });
    expect(data.plans[0]).toMatchObject({ meals: ['lunch', 'snacks'], monthlyPrice: 800, children: 3 });
    expect(data.children[0].current).toMatchObject({ charged: false, monthlyPrice: 800 });
    expect(data.children[1]).toMatchObject({ current: null, eatsNurseryMeals: false, hasTuition: false });
    expect(fnbErrorKey({ message: 'kitchen_not_enough' })).toBe('fnb.errors.kitchen_not_enough');
  });
});

describe('kitchen stock', () => {
  const item = (patch: Partial<KitchenItem>): KitchenItem => ({
    id: 'i', name: 'Milk', category: 'drinks', quantity: 10, unit: 'liter', lowStockLevel: 3, expiresOn: null, lastRestocked: null, ...patch,
  });
  const today = '2026-11-08';

  it('flags what is out, low, expired or expiring within three days', () => {
    expect(stockFlags(item({ quantity: 0 }), today)).toEqual({ out: true, low: false, expired: false, expiringSoon: false });
    expect(stockFlags(item({ quantity: 3 }), today).low).toBe(true);
    expect(stockFlags(item({ quantity: 3, lowStockLevel: 0 }), today).low).toBe(false);
    expect(stockFlags(item({ expiresOn: '2026-11-07' }), today).expired).toBe(true);
    expect(stockFlags(item({ expiresOn: '2026-11-11' }), today).expiringSoon).toBe(true);
    expect(stockFlags(item({ expiresOn: '2026-11-12' }), today).expiringSoon).toBe(false);
    // Nothing left: its date no longer matters.
    expect(stockFlags(item({ quantity: 0, expiresOn: '2026-11-01' }), today).expired).toBe(false);
  });

  it('puts what needs attention first and counts it', () => {
    const items = [item({ name: 'Rice' }), item({ name: 'Eggs', quantity: 2 }), item({ name: 'Juice', expiresOn: '2026-11-01' }), item({ name: 'Bread', quantity: 0 })];
    expect(sortForAttention(items, today).map((i) => i.name)).toEqual(['Juice', 'Bread', 'Eggs', 'Rice']);
    expect(stockTotals(items, today)).toEqual({ items: 4, out: 1, low: 1, expired: 1, expiringSoon: 0 });
  });

  it('checks a stock change as the database does', () => {
    expect(movementIssue('used', '', 5)).toBe('required');
    expect(movementIssue('used', '1.234', 5)).toBe('invalid');
    expect(movementIssue('restocked', '0', 5)).toBe('zero');
    expect(movementIssue('used', '6', 5)).toBe('more_than_stock');
    expect(movementIssue('spoiled', '5', 5)).toBeNull();
    expect(movementIssue('counted', '0', 5)).toBeNull();
    expect(quantityAfter('restocked', 2.5, 3)).toBe(5.5);
    expect(quantityAfter('used', 1.2, 3)).toBe(1.8);
    expect(quantityAfter('counted', 7, 3)).toBe(7);
    expect(itemIssues({ name: '', category: 'food', unit: '', lowStockLevel: 'a', expiresOn: '' })).toEqual({ name: 'name_required', unit: 'unit_required', lowStockLevel: 'level_invalid' });
  });

  it('reads get_kitchen_stock', () => {
    const data = toKitchenData({ can_edit: true, today, items: [{ id: 'a', name: 'Milk', category: 'toys', quantity: '3.00', low_stock_level: 2 }],
                                 movements: [{ id: 'm', kind: 'odd', change: '-4', quantity_after: 6 }] });
    expect(data.items[0]).toMatchObject({ category: 'food', quantity: 3, lowStockLevel: 2, expiresOn: null });
    expect(data.movements[0]).toMatchObject({ kind: 'counted', change: -4, quantityAfter: 6 });
  });
});

describe('allergies the menu is not checked against', () => {
  it('group by allergy, the largest first, each child once, worst reaction first', () => {
    const groups = groupUnmatched([
      { childId: 'a', childNameAr: '', childNameEn: 'Ayman', allergyName: 'Dust mites', severity: 'mild' },
      { childId: 'b', childNameAr: '', childNameEn: 'Azza', allergyName: 'Penicillin', severity: 'mild' },
      { childId: 'c', childNameAr: '', childNameEn: 'Bassem', allergyName: 'penicillin ', severity: 'severe' },
      { childId: 'c', childNameAr: '', childNameEn: 'Bassem', allergyName: 'Penicillin', severity: 'severe' },
    ]);
    expect(groups.map((g) => [g.name, g.children.map((c) => c.childNameEn).join(',')])).toEqual([
      ['Penicillin', 'Bassem,Azza'],
      ['Dust mites', 'Ayman'],
    ]);
  });
});

describe('health alerts', () => {
  const alert = (patch: Partial<HealthAlertItem>): HealthAlertItem => ({
    fingerprint: 'f', type: 'severe_allergy', urgency: 'high', childId: 'c', childNameAr: 'ليلى', childNameEn: 'Laila',
    classId: 'k1', classNameAr: '', classNameEn: '', detailAr: '', detailEn: '', ...patch,
  });
  const alerts = [
    alert({ fingerprint: '1', type: 'missing_pediatrician', urgency: 'medium', childNameEn: 'Adam' }),
    alert({ fingerprint: '2', type: 'life_threatening_allergy', urgency: 'critical', childNameEn: 'Sara', classId: 'k2' }),
    alert({ fingerprint: '3', type: 'severe_allergy', urgency: 'high' }),
    alert({ fingerprint: '4', type: 'medication_expired', urgency: 'high', childNameEn: 'Omar' }),
  ];

  it('count each kind for the summary', () => {
    expect(groupCounts(alerts)).toEqual({ allergies: 2, medicines: 1, vaccinations: 0, contacts: 1 });
  });

  it('filter by kind, type, class, urgency and name, most urgent first', () => {
    expect(filterAlerts(alerts, NO_FILTER).map((a) => a.fingerprint)).toEqual(['2', '3', '4', '1']);
    expect(filterAlerts(alerts, { ...NO_FILTER, group: 'allergies' }).map((a) => a.fingerprint)).toEqual(['2', '3']);
    expect(filterAlerts(alerts, { ...NO_FILTER, classId: 'k2' }).map((a) => a.fingerprint)).toEqual(['2']);
    expect(filterAlerts(alerts, { ...NO_FILTER, search: 'ليلى', urgency: 'high' }).map((a) => a.fingerprint)).toEqual(['3', '4']);
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, search: 'a' })).toBe(true);
  });

  it('every alert kind has its texts', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    for (const key of [
      ...ALERT_TYPES.map((t) => `health.dashboard.types.${t}`),
      ...['allergies', 'medicines', 'vaccinations', 'contacts'].flatMap((g) => [`health.dashboard.groups.${g}`, `health.dashboard.groupHints.${g}`]),
      ...['critical', 'high', 'medium', 'low'].map((u) => `health.dashboard.urgency.${u}`),
    ]) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
  });
});
