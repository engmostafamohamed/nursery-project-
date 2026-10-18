// Field checks for the deal and package editors. Pure, so each form can show an error under its
// field as soon as the field is touched, and so the rules are tested once. Each issue is a key
// under `packageForms.errors` in the locale files.

export type DiscountType = 'percentage' | 'fixed_amount';

export type DealFormValues = {
  name_ar: string;
  name_en: string;
  discount_type: DiscountType;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
};

export type DealFormIssues = {
  name?: 'nameRequired';
  discountValue?: 'valueRequired' | 'percentOver100';
  endsAt?: 'endsBeforeStart';
};

export type ExtraHoursPackageFormValues = {
  name_ar: string;
  name_en: string;
  coverage_type: 'unlimited' | 'hours_quota';
  included_hours: number | null;
  price: number;
  validity_value: number | null;
  validity_unit: 'months' | 'years' | null;
};

export type ExtraHoursPackageFormIssues = {
  name?: 'nameRequired';
  includedHours?: 'hoursRequired';
  price?: 'priceInvalid';
  validityValue?: 'validityRequired';
  validityUnit?: 'validityUnitRequired';
};

export type TuitionPackageFormValues = { name_ar: string; name_en: string; price: number };

export type TuitionPeriodValues = { active: boolean; price: number };

export type TuitionPackageFormIssues = {
  name?: 'nameRequired';
  price?: 'priceInvalid';
  periods?: 'noActivePeriod' | 'periodPriceInvalid';
};

const hasName = (values: { name_ar: string; name_en: string }) => Boolean(values.name_ar.trim() || values.name_en.trim());

const validPrice = (price: number) => Number.isFinite(price) && price >= 0;

/** A discount must be above zero, and a percentage at most 100 (more would make the package free). */
export function discountValueIssue(type: DiscountType, value: number): DealFormIssues['discountValue'] {
  if (!Number.isFinite(value) || value <= 0) return 'valueRequired';
  if (type === 'percentage' && value > 100) return 'percentOver100';
  return undefined;
}

export function dealFormIssues(values: DealFormValues): DealFormIssues {
  const issues: DealFormIssues = {};
  if (!hasName(values)) issues.name = 'nameRequired';
  const discount = discountValueIssue(values.discount_type, values.discount_value);
  if (discount) issues.discountValue = discount;
  if (values.starts_at && values.ends_at && new Date(values.ends_at).getTime() <= new Date(values.starts_at).getTime()) {
    issues.endsAt = 'endsBeforeStart';
  }
  return issues;
}

export function extraHoursPackageFormIssues(values: ExtraHoursPackageFormValues): ExtraHoursPackageFormIssues {
  const issues: ExtraHoursPackageFormIssues = {};
  if (!hasName(values)) issues.name = 'nameRequired';
  // The database stores whole hours.
  if (
    values.coverage_type === 'hours_quota' &&
    (values.included_hours === null || !Number.isInteger(values.included_hours) || values.included_hours <= 0)
  ) {
    issues.includedHours = 'hoursRequired';
  }
  if (!validPrice(values.price)) issues.price = 'priceInvalid';
  // Validity needs both parts; one without the other used to be dropped silently on save.
  if (values.validity_unit && !(values.validity_value && values.validity_value > 0)) issues.validityValue = 'validityRequired';
  if (values.validity_value && !values.validity_unit) issues.validityUnit = 'validityUnitRequired';
  return issues;
}

export function tuitionPackageFormIssues(
  values: TuitionPackageFormValues,
  periods: TuitionPeriodValues[] | null,
): TuitionPackageFormIssues {
  const issues: TuitionPackageFormIssues = {};
  if (!hasName(values)) issues.name = 'nameRequired';
  if (!validPrice(values.price)) issues.price = 'priceInvalid';
  if (periods) {
    const active = periods.filter((period) => period.active);
    // Parents need at least one period to choose; a period on sale needs a price.
    if (active.length === 0) issues.periods = 'noActivePeriod';
    else if (active.some((period) => !Number.isFinite(period.price) || period.price <= 0)) issues.periods = 'periodPriceInvalid';
  }
  return issues;
}

export function hasIssues(issues: object): boolean {
  return Object.values(issues).some(Boolean);
}
