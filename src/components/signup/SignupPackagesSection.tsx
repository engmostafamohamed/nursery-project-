import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ApplicationExtraHoursPackageCard } from '@/components/parent/ApplicationExtraHoursPackageCard';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { billingPeriodName, signupOptionsReady, type SignupOrder } from '@/features/parent-signup/signupOrder';
import type { SignupPaymentOptions } from '@/features/parent-signup/signupPayment';
import {
  bestPeriodSaving,
  computePackageBillingQuote,
  offeredBillingPeriods,
  periodsOfferedByAny,
  type ApplicationPackageBillingPeriod,
  type ApplicationPaymentPackage,
} from '@/hooks/useApplicationPackagePayment';
import { formatMoneyAmount } from '@/lib/money';
import { EMPTY_PARENT_PACKAGE_TEXTS, textFor } from '@/lib/parentPackageTexts';
import { cn } from '@/lib/utils';

import { SignupOrderSummary, SignupTotalBar } from './SignupOrderSummary';
import { SignupOptionsStatus } from './SignupOptionsStatus';

function localName(pkg: ApplicationPaymentPackage, isArabic: boolean) {
  return isArabic ? pkg.nameAr || pkg.nameEn : pkg.nameEn || pkg.nameAr;
}

function SectionTitle({ index, title, hint }: { index: number; title: string; hint: string }) {
  return (
    <legend className="mb-3 flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index}</span>
      <span>
        <span className="block font-semibold text-on-surface">{title}</span>
        <span className="mt-0.5 block whitespace-pre-line text-xs leading-5 text-on-surface-variant">{hint}</span>
      </span>
    </legend>
  );
}

type Props = {
  options: SignupPaymentOptions | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  outdatedFunction: boolean;
  onRetry: () => void;
  packageId: string;
  onPackageChange: (value: string) => void;
  billingPeriod: ApplicationPackageBillingPeriod;
  onBillingPeriodChange: (value: ApplicationPackageBillingPeriod) => void;
  extraHoursPackageId: string | null;
  onExtraHoursPackageChange: (value: string | null) => void;
  /** The total for what is picked, recalculated on every choice. */
  order: SignupOrder;
};

/**
 * Sign-up packages step: the tuition plan, how often to pay for it, and how extra time is paid,
 * with the total updating live beside the choices (at the bottom of the screen on phones).
 */
export function SignupPackagesSection({
  options,
  isLoading,
  isError,
  errorMessage,
  outdatedFunction,
  onRetry,
  packageId,
  onPackageChange,
  billingPeriod,
  onBillingPeriodChange,
  extraHoursPackageId,
  onExtraHoursPackageChange,
  order,
}: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  // The nursery's own texts, when it wrote them in this language; otherwise the standard ones.
  const texts = options?.texts ?? EMPTY_PARENT_PACKAGE_TEXTS;
  // The parent picks the period first: every period at least one plan offers.
  const periodOptions = useMemo(() => periodsOfferedByAny(options?.packages ?? []), [options?.packages]);
  // Start on (or move to) a period some plan offers, e.g. when no plan is sold monthly.
  useEffect(() => {
    if (periodOptions.length > 0 && !periodOptions.includes(billingPeriod)) onBillingPeriodChange(periodOptions[0]);
  }, [periodOptions, billingPeriod, onBillingPeriodChange]);

  if (!signupOptionsReady(options, isLoading, isError)) {
    return (
      <SignupOptionsStatus
        options={options}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errorMessage}
        outdatedFunction={outdatedFunction}
        onRetry={onRetry}
      />
    );
  }

  const selectedPackage = order.tuitionPackage;
  const hourlyRate = options.extraHoursHourlyPlan?.rate ?? null;
  const showExtraHours = options.extraHoursPackages.length > 0 || Boolean(options.extraHoursHourlyPlan);
  const activePeriod = periodOptions.includes(billingPeriod) ? billingPeriod : periodOptions[0];

  const choosePeriod = (period: ApplicationPackageBillingPeriod) => {
    onBillingPeriodChange(period);
    // A plan without this period cannot stay chosen.
    if (selectedPackage && !offeredBillingPeriods(selectedPackage).includes(period)) onPackageChange('');
  };

  return (
    <div className="space-y-6">
      <p className="max-w-2xl whitespace-pre-line text-sm leading-6 text-on-surface-variant">
        {textFor(texts.paymentIntro, isArabic) ?? t('signup.payment.description')}
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <div className="min-w-0 space-y-8">
          <fieldset>
            <SectionTitle index={1} title={t('signup.payment.billingPeriod')} hint={t('signup.packages.periodHint')} />
            <div
              role="radiogroup"
              aria-label={t('signup.payment.billingPeriod')}
              className={cn('grid gap-2', periodOptions.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}
            >
              {periodOptions.map((period) => {
                const active = period === activePeriod;
                const saving = bestPeriodSaving(options.packages, period);
                return (
                  <button
                    key={period}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choosePeriod(period)}
                    className={cn(
                      'flex min-h-14 flex-col items-center justify-center rounded-xl border px-3 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant bg-surface hover:border-primary/50',
                    )}
                  >
                    <span className={cn('text-sm font-semibold', active ? 'text-primary' : 'text-on-surface')}>{billingPeriodName(t, period)}</span>
                    {saving > 0 ? (
                      <span className="mt-0.5 text-[11px] font-medium text-success">
                        {t('applications.paymentPackage.saveUpTo', { percent: saving })}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <SectionTitle
              index={2}
              title={t('signup.payment.tuitionPlan')}
              hint={textFor(texts.tuitionIntro, isArabic) ?? t('signup.payment.chooseTuitionHint')}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {options.packages.map((pkg) => {
                const offered = offeredBillingPeriods(pkg).includes(activePeriod);
                const quote = computePackageBillingQuote(pkg, activePeriod);
                const active = packageId === pkg.id && offered;
                const description = isArabic ? pkg.descriptionAr || pkg.descriptionEn : pkg.descriptionEn || pkg.descriptionAr;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    aria-pressed={active}
                    disabled={!offered}
                    onClick={() => {
                      onPackageChange(pkg.id);
                      if (activePeriod !== billingPeriod) onBillingPeriodChange(activePeriod);
                    }}
                    className={cn(
                      'group relative flex min-h-28 flex-col rounded-xl border p-4 text-start transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
                      active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant bg-surface enabled:hover:border-primary/50',
                    )}
                  >
                    <span className="flex w-full items-start justify-between gap-3">
                      <span className="min-w-0 font-semibold text-on-surface">{localName(pkg, isArabic)}</span>
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                          active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-transparent',
                        )}
                      >
                        <MaterialSymbol name="check" size="text-xs" />
                      </span>
                    </span>
                    {offered && quote.discountAmount > 0 ? (
                      <span className="mt-2 inline-flex w-fit items-center rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                        {t('signup.payment.discountBadge')}
                      </span>
                    ) : null}
                    {description ? <span className="mt-1.5 block whitespace-pre-line text-xs leading-5 text-on-surface-variant">{description}</span> : null}
                    {offered ? (
                      <>
                        <span className="mt-auto flex flex-wrap items-baseline gap-2 pt-4">
                          {quote.discountAmount > 0 ? (
                            <span className="text-xs tabular-nums text-on-surface-variant line-through">{money(quote.subtotal)}</span>
                          ) : null}
                          <span className="text-lg font-bold tracking-tight tabular-nums text-on-surface">{money(quote.total)}</span>
                          <span className="text-xs text-on-surface-variant">{billingPeriodName(t, activePeriod)}</span>
                        </span>
                        {quote.billingMonths > 1 ? (
                          <span className="mt-0.5 block text-xs tabular-nums text-on-surface-variant">
                            {t('applications.paymentPackage.perMonthEquivalent', { amount: money(quote.total / quote.billingMonths) })}
                          </span>
                        ) : null}
                        {quote.discountAmount > 0 ? (
                          <span className="mt-1 block text-xs font-medium text-success">
                            {t('signup.payment.discountSaved', { amount: money(quote.discountAmount) })}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-on-surface-variant">
                        <MaterialSymbol name="event_busy" size="text-sm" />
                        {t('applications.paymentPackage.periodNotOffered', { period: billingPeriodName(t, activePeriod) })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {showExtraHours ? (
            <fieldset>
              <SectionTitle
                index={3}
                title={t('applications.extraHoursPackage.title')}
                hint={textFor(texts.extraHoursIntro, isArabic) ?? t('signup.payment.extraHoursHint')}
              />
              <ApplicationExtraHoursPackageCard
                embedded
                packages={options.extraHoursPackages}
                selectedPackageId={extraHoursPackageId}
                hourlyPlan={options.extraHoursHourlyPlan}
                canChoose
                onSelect={onExtraHoursPackageChange}
              />
            </fieldset>
          ) : null}
        </div>

        <aside className="xl:sticky xl:top-24">
          <SignupOrderSummary order={order} billingPeriod={billingPeriod} hourlyRate={hourlyRate} live />
        </aside>
      </div>

      {/* Phones and tablets: the live total stays in view while scrolling the choices. */}
      <SignupTotalBar order={order} className="sticky bottom-3 z-10 xl:hidden" />
    </div>
  );
}
