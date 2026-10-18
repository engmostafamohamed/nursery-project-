// What a parent signing up is about to pay, from the packages they picked: the tuition plan for
// the chosen billing period, the extra-hours package (if any), their deals, and the total. One
// calculation for the live total on the packages step, the summary on the payment step and the
// submit check, using the same pricing as select_application_payment_package.
import type { TFunction } from 'i18next';

import { computeExtraHoursDisplayPrice, type ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import {
  computePackageBillingQuote,
  offeredBillingPeriods,
  type ApplicationPackageBillingPeriod,
  type ApplicationPaymentPackage,
  type PackageBillingQuote,
} from '@/hooks/useApplicationPackagePayment';

import type { SignupPaymentOptions } from './signupPayment';

export type SignupOrderSelection = {
  packageId: string;
  billingPeriod: ApplicationPackageBillingPeriod;
  extraHoursPackageId: string | null;
};

export type SignupOrder = {
  tuitionPackage: ApplicationPaymentPackage | null;
  /** The chosen plan for the chosen period; null until a plan is chosen or if it lacks that period. */
  tuition: PackageBillingQuote | null;
  extraHoursPackage: ApplicationExtraHoursPackage | null;
  extraHours: { price: number; discountAmount: number; total: number } | null;
  /** Paid now: tuition for the period plus the extra-hours package. Hourly extra time is billed later. */
  totalDue: number;
  totalSavings: number;
  /** A tuition plan with a period it offers: enough to continue to payment. */
  complete: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function computeSignupOrder(
  options: { packages: ApplicationPaymentPackage[]; extraHoursPackages: ApplicationExtraHoursPackage[] } | null | undefined,
  selection: SignupOrderSelection,
): SignupOrder {
  const tuitionPackage = options?.packages.find((pkg) => pkg.id === selection.packageId) ?? null;
  const periodOffered = Boolean(tuitionPackage && offeredBillingPeriods(tuitionPackage).includes(selection.billingPeriod));
  const tuition = tuitionPackage && periodOffered ? computePackageBillingQuote(tuitionPackage, selection.billingPeriod) : null;

  const extraHoursPackage = options?.extraHoursPackages.find((pkg) => pkg.id === selection.extraHoursPackageId) ?? null;
  const extraQuote = extraHoursPackage ? computeExtraHoursDisplayPrice(extraHoursPackage) : null;
  const extraHours =
    extraHoursPackage && extraQuote
      ? { price: extraHoursPackage.price, discountAmount: extraQuote.discountAmount, total: extraQuote.displayPrice }
      : null;

  return {
    tuitionPackage,
    tuition,
    extraHoursPackage,
    extraHours,
    totalDue: round2((tuition?.total ?? 0) + (extraHours?.total ?? 0)),
    totalSavings: round2((tuition?.discountAmount ?? 0) + (extraHours?.discountAmount ?? 0)),
    complete: tuition !== null,
  };
}

/** "Monthly", "Quarter", … in the current language. */
export function billingPeriodName(t: TFunction, period: ApplicationPackageBillingPeriod): string {
  return t(`applications.paymentPackage.period.${period === 'half_annual' ? 'halfAnnual' : period}`);
}

/** True when the options are loaded and the nursery offers at least one tuition plan. */
export function signupOptionsReady(
  options: SignupPaymentOptions | undefined,
  isLoading: boolean,
  isError: boolean,
): options is SignupPaymentOptions {
  return !isLoading && !isError && Boolean(options) && (options?.packages.length ?? 0) > 0;
}
