// What a parent signing up is about to pay, from the packages they picked: the tuition plan for
// the chosen billing period, the extra-hours package (if any), their discounts, and the total. One
// calculation for the live total on the packages step, the summary on the payment step and the
// submit check, using the same pricing as select_application_payment_package: the package's deal
// and, when the family works at a partner that needs no proof, the partner's discount, together
// within the nursery's cap (combineDiscounts). A partner that needs a proof is checked by the
// nursery first, so its discount is only shown as expected.
import type { TFunction } from 'i18next';

import { combineDiscounts, discountAmount, type DiscountPartner, type DiscountSource, type PartnerApplies } from '@/features/discounts/discounts';
import { isExtraHoursDealActive, type ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import {
  computePackageBillingQuote,
  isApplicationDealActive,
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
  /** The partner the family says it works at. */
  partner?: DiscountPartner | null;
};

/** One discount on the order: whose, and what it takes off (less than its own amount when the cap cut it). */
export type OrderDiscount = { source: DiscountSource; nameAr: string; nameEn: string; amount: number; capped: boolean };

export type SignupOrder = {
  tuitionPackage: ApplicationPaymentPackage | null;
  /** The chosen plan for the chosen period, after its discounts; null until a plan is chosen or if it lacks that period. */
  tuition: PackageBillingQuote | null;
  tuitionDiscounts: OrderDiscount[];
  extraHoursPackage: ApplicationExtraHoursPackage | null;
  extraHours: { price: number; discountAmount: number; total: number } | null;
  extraHoursDiscounts: OrderDiscount[];
  /** A partner that needs a proof: what its discount would take off once the nursery confirms it. */
  expectedPartner: { partner: DiscountPartner; amount: number } | null;
  /** Paid now: tuition for the period plus the extra-hours package. Hourly extra time is billed later. */
  totalDue: number;
  totalSavings: number;
  /** A tuition plan with a period it offers: enough to continue to payment. */
  complete: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const sum = (lines: readonly OrderDiscount[]) => round2(lines.reduce((total, line) => total + line.amount, 0));

type Deal = NonNullable<ApplicationPaymentPackage['deal']>;

/** The discounts on one charge: the package's deal (while it runs) and the partner's, within the cap. */
function chargeDiscounts(
  subtotal: number,
  deal: Deal | null,
  partner: DiscountPartner | null,
  scope: PartnerApplies,
  capPercent: number,
): OrderDiscount[] {
  const candidates: (OrderDiscount & { amount: number })[] = [];
  if (deal) {
    candidates.push({ source: 'deal', nameAr: deal.nameAr, nameEn: deal.nameEn, amount: discountAmount(deal.discountType, deal.discountValue, subtotal), capped: false });
  }
  if (partner && partner.appliesTo.includes(scope)) {
    candidates.push({
      source: 'partnership',
      nameAr: partner.nameAr,
      nameEn: partner.nameEn,
      amount: discountAmount(partner.discountType, partner.discountValue, subtotal),
      capped: false,
    });
  }
  return combineDiscounts(subtotal, candidates, capPercent).map((line) => ({ ...line, amount: line.taken, capped: line.capped }));
}

export function computeSignupOrder(
  options: Pick<SignupPaymentOptions, 'packages' | 'extraHoursPackages'> & { discountCapPercent?: number } | null | undefined,
  selection: SignupOrderSelection,
): SignupOrder {
  const capPercent = options?.discountCapPercent ?? 30;
  const partner = selection.partner ?? null;
  // A partner needing no proof counts at once; one needing a proof waits for the nursery.
  const partnerNow = partner && !partner.requiresProof ? partner : null;

  const tuitionPackage = options?.packages.find((pkg) => pkg.id === selection.packageId) ?? null;
  const periodOffered = Boolean(tuitionPackage && offeredBillingPeriods(tuitionPackage).includes(selection.billingPeriod));
  const quote = tuitionPackage && periodOffered ? computePackageBillingQuote(tuitionPackage, selection.billingPeriod) : null;
  const tuitionDeal = tuitionPackage?.deal && isApplicationDealActive(tuitionPackage.deal) ? tuitionPackage.deal : null;
  const tuitionDiscounts = quote ? chargeDiscounts(quote.subtotal, tuitionDeal, partnerNow, 'tuition', capPercent) : [];
  const tuition = quote
    ? { ...quote, discountAmount: sum(tuitionDiscounts), total: round2(Math.max(quote.subtotal - sum(tuitionDiscounts), 0)) }
    : null;

  const extraHoursPackage = options?.extraHoursPackages.find((pkg) => pkg.id === selection.extraHoursPackageId) ?? null;
  const extraDeal = extraHoursPackage?.deal && isExtraHoursDealActive(extraHoursPackage.deal) ? extraHoursPackage.deal : null;
  const extraHoursDiscounts = extraHoursPackage ? chargeDiscounts(extraHoursPackage.price, extraDeal, partnerNow, 'extra_hours', capPercent) : [];
  const extraHours = extraHoursPackage
    ? {
        price: extraHoursPackage.price,
        discountAmount: sum(extraHoursDiscounts),
        total: round2(Math.max(extraHoursPackage.price - sum(extraHoursDiscounts), 0)),
      }
    : null;

  // What a partner needing a proof would take off this tuition and package once confirmed.
  let expectedPartner: SignupOrder['expectedPartner'] = null;
  if (partner && partner.requiresProof) {
    const would = [
      ...(quote ? chargeDiscounts(quote.subtotal, tuitionDeal, partner, 'tuition', capPercent) : []),
      ...(extraHoursPackage ? chargeDiscounts(extraHoursPackage.price, extraDeal, partner, 'extra_hours', capPercent) : []),
    ];
    expectedPartner = { partner, amount: sum(would.filter((line) => line.source === 'partnership')) };
  }

  return {
    tuitionPackage,
    tuition,
    tuitionDiscounts,
    extraHoursPackage,
    extraHours,
    extraHoursDiscounts,
    expectedPartner,
    totalDue: round2((tuition?.total ?? 0) + (extraHours?.total ?? 0)),
    totalSavings: round2(sum(tuitionDiscounts) + sum(extraHoursDiscounts)),
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
