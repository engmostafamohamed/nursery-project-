// Sign-up packages step: the live total a parent sees while choosing, and when they may move on
// to payment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import { bestPeriodSaving, periodsOfferedByAny, type ApplicationPaymentPackage } from '@/hooks/useApplicationPackagePayment';

import type { DiscountPartner } from '@/features/discounts/discounts';

import { computeSignupOrder } from './signupOrder';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const deal = (discountType: 'percentage' | 'fixed_amount', discountValue: number) => ({
  id: 'd', nameAr: 'خصم', nameEn: 'Deal', discountType, discountValue, startsAt: null, endsAt: '2026-10-29T00:00:00Z', active: true,
});

const fullDay: ApplicationPaymentPackage = {
  id: 'full', nameAr: 'يوم كامل', nameEn: 'Full day', descriptionAr: null, descriptionEn: null, price: 11000, dailyHours: 11,
  featuresJson: [], deal: deal('percentage', 2),
  billingPeriods: [
    { billingPeriod: 'monthly', durationMonths: 1, price: 11000 },
    { billingPeriod: 'quarterly', durationMonths: 3, price: 30000 },
  ],
};
const annualOnly: ApplicationPaymentPackage = {
  ...fullDay, id: 'annual', deal: deal('fixed_amount', 55), billingPeriods: [{ billingPeriod: 'annual', durationMonths: 12, price: 12000 }],
};
const latePack: ApplicationExtraHoursPackage = {
  id: 'late', nameAr: 'باقة', nameEn: '5-hour pack', descriptionAr: null, descriptionEn: null, price: 300, coverageType: 'hours_quota',
  includedHours: 5, validityValue: 3, validityUnit: 'months', deal: deal('fixed_amount', 50),
};
const options = { packages: [fullDay, annualOnly], extraHoursPackages: [latePack] };

describe('sign-up order total', () => {
  it('shows nothing to pay and blocks payment until a tuition plan is chosen', () => {
    const order = computeSignupOrder(options, { packageId: '', billingPeriod: 'monthly', extraHoursPackageId: 'late' });
    expect(order).toMatchObject({ tuition: null, complete: false });
    // The extra-hours package alone is shown, but is not enough to continue.
    expect(order.totalDue).toBe(250);
  });

  it('adds the tuition for the chosen period and its deal', () => {
    const order = computeSignupOrder(options, { packageId: 'full', billingPeriod: 'quarterly', extraHoursPackageId: null });
    expect(order.tuition).toMatchObject({ subtotal: 30000, discountAmount: 600, total: 29400, billingMonths: 3 });
    expect(order).toMatchObject({ totalDue: 29400, totalSavings: 600, complete: true });
  });

  it('adds the extra-hours package after its own deal', () => {
    const order = computeSignupOrder(options, { packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: 'late' });
    expect(order.extraHours).toEqual({ price: 300, discountAmount: 50, total: 250 });
    expect(order).toMatchObject({ totalDue: 10780 + 250, totalSavings: 220 + 50 });
  });

  it('is not complete for a period the plan does not offer', () => {
    const order = computeSignupOrder(options, { packageId: 'annual', billingPeriod: 'monthly', extraHoursPackageId: null });
    expect(order).toMatchObject({ tuition: null, complete: false, totalDue: 0 });
    expect(computeSignupOrder(options, { packageId: 'annual', billingPeriod: 'annual', extraHoursPackageId: null }).totalDue).toBe(11945);
  });

  it('stops discounting when the deal has ended', () => {
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const order = computeSignupOrder(options, { packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: 'late' });
    expect(order).toMatchObject({ totalDue: 11300, totalSavings: 0 });
  });

  it('handles options that have not loaded yet', () => {
    expect(computeSignupOrder(undefined, { packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: null })).toMatchObject({
      tuitionPackage: null,
      complete: false,
      totalDue: 0,
    });
  });
});

describe('sign-up order with a partner discount', () => {
  const partner = (overrides: Partial<DiscountPartner> = {}): DiscountPartner => ({
    id: 'p', scope: 'branch', kind: 'company', nameAr: 'فودافون', nameEn: 'Vodafone', aliases: [], offerDetailsAr: null, offerDetailsEn: null,
    discountType: 'percentage', discountValue: 15, appliesTo: ['tuition'], startsOn: '2026-01-01', endsOn: null, requiresProof: false,
    proofNoteAr: null, proofNoteEn: null, maxFamilies: null, active: true, state: 'active', contactName: null, contactPhone: null,
    contactEmail: null, agreementRef: null, activeFamilies: 0, pendingFamilies: 0, openFamilies: 0, given: 0, canEdit: false, full: false,
    ...overrides,
  });
  const withCap = (cap: number) => ({ ...options, discountCapPercent: cap });

  it('takes a partner needing no proof off at once, beside the deal', () => {
    const order = computeSignupOrder(withCap(30), { packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: null, partner: partner() });
    // 11,000: the partner's 15% (1,650) first, then the deal's 2% (220), together under 30%.
    expect(order.tuitionDiscounts.map((l) => [l.source, l.amount, l.capped])).toEqual([
      ['partnership', 1650, false],
      ['deal', 220, false],
    ]);
    expect(order).toMatchObject({ totalDue: 9130, totalSavings: 1870, expectedPartner: null });
    expect(order.tuition).toMatchObject({ discountAmount: 1870, total: 9130 });
  });

  it('cuts the smaller discount at the nursery\'s cap', () => {
    const order = computeSignupOrder(withCap(16), { packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: null, partner: partner() });
    expect(order.tuitionDiscounts.map((l) => [l.source, l.amount, l.capped])).toEqual([
      ['partnership', 1650, false],
      ['deal', 110, true],
    ]);
    expect(order.totalDue).toBe(9240);
  });

  it('covers the extra-hours package only when the partner covers extra hours', () => {
    const tuitionOnly = computeSignupOrder(withCap(30), { packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: 'late', partner: partner() });
    expect(tuitionOnly.extraHoursDiscounts.map((l) => l.source)).toEqual(['deal']);
    const both = computeSignupOrder(withCap(30), {
      packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: 'late', partner: partner({ appliesTo: ['tuition', 'extra_hours'] }),
    });
    // 300: the deal's 50 first, then the partner's 15% (45), within 30% (90): 40 left for it.
    expect(both.extraHoursDiscounts.map((l) => [l.source, l.amount, l.capped])).toEqual([
      ['deal', 50, false],
      ['partnership', 40, true],
    ]);
    expect(both.extraHours).toEqual({ price: 300, discountAmount: 90, total: 210 });
  });

  it('only expects the discount of a partner needing a proof: this payment stays as it is', () => {
    const order = computeSignupOrder(withCap(30), {
      packageId: 'full', billingPeriod: 'monthly', extraHoursPackageId: null, partner: partner({ requiresProof: true }),
    });
    expect(order.tuitionDiscounts.map((l) => l.source)).toEqual(['deal']);
    expect(order.totalDue).toBe(10780);
    expect(order.expectedPartner).toMatchObject({ amount: 1650 });
  });
});

describe('sign-up billing period choice', () => {
  it('offers every period some plan has, in order, and skips the ones none has', () => {
    expect(periodsOfferedByAny([fullDay, annualOnly])).toEqual(['monthly', 'quarterly', 'annual']);
    expect(periodsOfferedByAny([annualOnly])).toEqual(['annual']);
    // A plan with no periods set is sold for all of them.
    expect(periodsOfferedByAny([{ ...fullDay, billingPeriods: [] }])).toEqual(['monthly', 'quarterly', 'half_annual', 'annual']);
  });

  it('shows the best saving against paying month by month, from plans that offer the period', () => {
    // 30,000 for 3 months against 3 × 11,000.
    expect(bestPeriodSaving([fullDay, annualOnly], 'quarterly')).toBe(9);
    expect(bestPeriodSaving([fullDay, annualOnly], 'monthly')).toBe(0);
    expect(bestPeriodSaving([fullDay, annualOnly], 'half_annual')).toBe(0);
  });
});
