// Deal and package editors: which field each mistake is shown under.
import { describe, expect, it } from 'vitest';

import {
  dealFormIssues,
  discountValueIssue,
  extraHoursPackageFormIssues,
  hasIssues,
  tuitionPackageFormIssues,
  type DealFormValues,
  type ExtraHoursPackageFormValues,
} from './packageForms';

describe('deal form', () => {
  const deal = (overrides: Partial<DealFormValues> = {}): DealFormValues => ({
    name_ar: '',
    name_en: 'Summer offer',
    discount_type: 'percentage',
    discount_value: 10,
    starts_at: null,
    ends_at: null,
    ...overrides,
  });

  it('accepts a named deal with a sensible discount', () => {
    expect(dealFormIssues(deal())).toEqual({});
    expect(dealFormIssues(deal({ name_en: '', name_ar: 'عرض الصيف' }))).toEqual({});
  });

  it('needs a name in either language', () => {
    expect(dealFormIssues(deal({ name_en: '  ' })).name).toBe('nameRequired');
  });

  it('needs a discount above zero, and at most 100%', () => {
    expect(discountValueIssue('percentage', 0)).toBe('valueRequired');
    expect(discountValueIssue('fixed_amount', -5)).toBe('valueRequired');
    expect(discountValueIssue('percentage', 100)).toBeUndefined();
    expect(discountValueIssue('percentage', 150)).toBe('percentOver100');
    // A fixed amount has no upper limit: it is capped at the package price when applied.
    expect(discountValueIssue('fixed_amount', 5000)).toBeUndefined();
  });

  it('must end after it starts', () => {
    expect(dealFormIssues(deal({ starts_at: '2026-10-20T10:00:00Z', ends_at: '2026-10-19T10:00:00Z' })).endsAt).toBe('endsBeforeStart');
    expect(dealFormIssues(deal({ starts_at: '2026-10-20T10:00:00Z', ends_at: '2026-10-20T10:00:00Z' })).endsAt).toBe('endsBeforeStart');
    expect(dealFormIssues(deal({ starts_at: null, ends_at: '2026-10-19T10:00:00Z' })).endsAt).toBeUndefined();
  });
});

describe('extra-hours package form', () => {
  const pkg = (overrides: Partial<ExtraHoursPackageFormValues> = {}): ExtraHoursPackageFormValues => ({
    name_ar: 'باقة',
    name_en: '',
    coverage_type: 'unlimited',
    included_hours: null,
    price: 400,
    validity_value: null,
    validity_unit: null,
    ...overrides,
  });

  it('accepts an unlimited package without hours', () => {
    expect(hasIssues(extraHoursPackageFormIssues(pkg()))).toBe(false);
  });

  it('a quota package needs whole hours above zero', () => {
    expect(extraHoursPackageFormIssues(pkg({ coverage_type: 'hours_quota' })).includedHours).toBe('hoursRequired');
    expect(extraHoursPackageFormIssues(pkg({ coverage_type: 'hours_quota', included_hours: 2.5 })).includedHours).toBe('hoursRequired');
    expect(extraHoursPackageFormIssues(pkg({ coverage_type: 'hours_quota', included_hours: 10 })).includedHours).toBeUndefined();
  });

  it('validity needs both a number and a unit', () => {
    expect(extraHoursPackageFormIssues(pkg({ validity_unit: 'months' })).validityValue).toBe('validityRequired');
    expect(extraHoursPackageFormIssues(pkg({ validity_value: 3 })).validityUnit).toBe('validityUnitRequired');
    expect(hasIssues(extraHoursPackageFormIssues(pkg({ validity_value: 3, validity_unit: 'months' })))).toBe(false);
  });

  it('refuses a negative price', () => {
    expect(extraHoursPackageFormIssues(pkg({ price: -1 })).price).toBe('priceInvalid');
    expect(extraHoursPackageFormIssues(pkg({ price: 0 })).price).toBeUndefined();
  });
});

describe('tuition package form', () => {
  const values = { name_ar: '', name_en: 'Full day', price: 11000 };

  it('accepts a package with an active, priced period', () => {
    expect(tuitionPackageFormIssues(values, [{ active: true, price: 11000 }, { active: false, price: 0 }])).toEqual({});
  });

  it('needs at least one period switched on', () => {
    expect(tuitionPackageFormIssues(values, [{ active: false, price: 11000 }]).periods).toBe('noActivePeriod');
  });

  it('an active period needs a price', () => {
    expect(tuitionPackageFormIssues(values, [{ active: true, price: 0 }]).periods).toBe('periodPriceInvalid');
  });

  it('skips the period checks while the periods are still loading', () => {
    expect(tuitionPackageFormIssues({ ...values, name_en: '' }, null)).toEqual({ name: 'nameRequired' });
  });
});
