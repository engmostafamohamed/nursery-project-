// Module 6 · Packages, pricing & deals — deal windows, discounted prices and tuition billing periods.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyDealToPrice, isDealCurrentlyActive } from './useAdminDeals';
import {
  billingPeriodRowsFromExisting,
  resyncUntouchedBillingPeriods,
  type TuitionBillingPeriodRow,
} from './useAdminTuitionBillingPeriods';
import { computeExtraHoursDisplayPrice, type ApplicationExtraHoursPackageDeal } from './useApplicationExtraHoursPackage';
import { computePackageBillingQuote, offeredBillingPeriods } from './useApplicationPackagePayment';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('when a deal can be used', () => {
  it.each([
    ['active with no dates', { active: true, starts_at: null, ends_at: null }, true],
    ['switched off', { active: false, starts_at: null, ends_at: null }, false],
    ['inside its window', { active: true, starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-31T00:00:00Z' }, true],
    ['not started yet', { active: true, starts_at: '2026-10-15T00:00:00Z', ends_at: null }, false],
    ['ended', { active: true, starts_at: null, ends_at: '2026-10-14T09:00:00Z' }, false],
  ])('a deal %s: %s', (_label, deal, usable) => {
    expect(isDealCurrentlyActive(deal)).toBe(usable);
  });
});

describe('deal prices', () => {
  it('takes a percentage off', () => {
    expect(applyDealToPrice(2000, { discount_type: 'percentage', discount_value: 15 })).toBe(1700);
    // The discount is rounded to piastres: 10% of 999.99 is 100.00.
    expect(applyDealToPrice(999.99, { discount_type: 'percentage', discount_value: 10 })).toBeCloseTo(899.99, 2);
  });

  it('takes a fixed amount off, never below zero', () => {
    expect(applyDealToPrice(2000, { discount_type: 'fixed_amount', discount_value: 250 })).toBe(1750);
    expect(applyDealToPrice(200, { discount_type: 'fixed_amount', discount_value: 250 })).toBe(0);
  });
});

describe('extra-hours package price on the sign-up invoice', () => {
  const deal = (overrides: Partial<ApplicationExtraHoursPackageDeal> = {}): ApplicationExtraHoursPackageDeal => ({
    id: 'd1',
    nameAr: 'خصم',
    nameEn: 'Discount',
    discountType: 'percentage',
    discountValue: 20,
    startsAt: null,
    endsAt: null,
    active: true,
    ...overrides,
  });

  it('applies a live deal', () => {
    expect(computeExtraHoursDisplayPrice({ price: 500, deal: deal() })).toEqual({ discountAmount: 100, displayPrice: 400, dealApplied: true });
  });

  it('ignores a missing, switched-off or expired deal', () => {
    const full = { discountAmount: 0, displayPrice: 500, dealApplied: false };
    expect(computeExtraHoursDisplayPrice({ price: 500, deal: null })).toEqual(full);
    expect(computeExtraHoursDisplayPrice({ price: 500, deal: deal({ active: false }) })).toEqual(full);
    expect(computeExtraHoursDisplayPrice({ price: 500, deal: deal({ endsAt: '2026-10-01T00:00:00Z' }) })).toEqual(full);
  });

  it('never discounts more than the price', () => {
    expect(computeExtraHoursDisplayPrice({ price: 300, deal: deal({ discountType: 'fixed_amount', discountValue: 400 }) })).toEqual({
      discountAmount: 300,
      displayPrice: 0,
      dealApplied: true,
    });
  });
});

describe('tuition billing periods', () => {
  it('a new package prices every period from the monthly price', () => {
    const rows = billingPeriodRowsFromExisting([], 1500);
    expect(Object.values(rows).map((r) => [r.billing_period, r.duration_months, r.price, r.touched])).toEqual([
      ['monthly', 1, 1500, false],
      ['quarterly', 3, 4500, false],
      ['half_annual', 6, 9000, false],
      ['annual', 12, 18000, false],
    ]);
  });

  it('keeps saved prices, so a discount the admin set is not lost', () => {
    const saved: TuitionBillingPeriodRow = {
      id: 'bp1',
      tuition_package_id: 'tp1',
      billing_period: 'annual',
      duration_months: 12,
      price: 15000,
      active: true,
    };
    const rows = billingPeriodRowsFromExisting([saved], 1500);
    expect(rows.annual).toMatchObject({ id: 'bp1', price: 15000, touched: true });
    expect(rows.monthly.touched).toBe(false);
  });

  it('a new monthly price updates only the periods nobody edited', () => {
    const rows = billingPeriodRowsFromExisting([], 1500);
    const edited = { ...rows, annual: { ...rows.annual, price: 15000, touched: true } };
    const next = resyncUntouchedBillingPeriods(edited, 2000);
    expect(next.quarterly.price).toBe(6000);
    expect(next.annual.price).toBe(15000);
  });

  it('returns the same rows when nothing changes, so the form does not re-render', () => {
    const rows = billingPeriodRowsFromExisting([], 1500);
    expect(resyncUntouchedBillingPeriods(rows, 1500)).toBe(rows);
  });

  it('rounds period prices to piastres', () => {
    expect(billingPeriodRowsFromExisting([], 1333.333).quarterly.price).toBe(4000);
  });
});

describe('billing periods a parent can choose', () => {
  const period = (billingPeriod: 'monthly' | 'quarterly' | 'half_annual' | 'annual', durationMonths: number, price: number) => ({
    billingPeriod,
    durationMonths,
    price,
  });

  it('offers only the periods the nursery switched on, shortest first', () => {
    const pkg = { billingPeriods: [period('annual', 12, 12000), period('quarterly', 3, 3000)] };
    expect(offeredBillingPeriods(pkg)).toEqual(['quarterly', 'annual']);
  });

  it('offers every period for a package with none configured, priced from the monthly price', () => {
    const pkg = { price: 1000, billingPeriods: [], deal: null };
    expect(offeredBillingPeriods(pkg)).toEqual(['monthly', 'quarterly', 'half_annual', 'annual']);
    expect(computePackageBillingQuote(pkg, 'half_annual')).toMatchObject({ billingMonths: 6, subtotal: 6000, total: 6000 });
  });
});
