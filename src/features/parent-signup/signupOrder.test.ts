// Sign-up packages step: the live total a parent sees while choosing, and when they may move on
// to payment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import type { ApplicationPaymentPackage } from '@/hooks/useApplicationPackagePayment';

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
