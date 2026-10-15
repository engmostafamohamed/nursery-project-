import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ApplicationExtraHoursPackageCard } from '@/components/parent/ApplicationExtraHoursPackageCard';
import { PaymentMethodDetails } from '@/components/payment/PaymentMethodDetails';
import { PaymentMethodPicker } from '@/components/payment/PaymentMethodPicker';
import {
  computePackageBillingQuote,
  type ApplicationPackageBillingPeriod,
  type ApplicationPaymentPackage,
} from '@/hooks/useApplicationPackagePayment';
import { computeExtraHoursDisplayPrice } from '@/hooks/useApplicationExtraHoursPackage';
import { isWalletProvider, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import type { PaymentDetails, PaymentDetailsIssue } from '@/lib/paymentMethods';
import type { SignupPaymentOptions } from '@/features/parent-signup/signupPayment';

const billingPeriods: Array<{ value: ApplicationPackageBillingPeriod; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_annual', label: 'Half annual' },
  { value: 'annual', label: 'Annual' },
];

function displayPackageName(pkg: ApplicationPaymentPackage, isArabic: boolean) {
  return isArabic ? pkg.nameAr || pkg.nameEn : pkg.nameEn || pkg.nameAr;
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
  extraHoursPackageId: string | null;
  onExtraHoursPackageChange: (value: string | null) => void;
  billingPeriod: ApplicationPackageBillingPeriod;
  onBillingPeriodChange: (value: ApplicationPackageBillingPeriod) => void;
  method: ParentPaymentMethodCode;
  onMethodChange: (value: ParentPaymentMethodCode) => void;
  /** What the parent entered for the chosen method (reference, wallet details, test card). */
  details: PaymentDetails;
  /** What is still missing for the chosen method. */
  issues: PaymentDetailsIssue[];
  onDetailsChange: (patch: Partial<PaymentDetails>) => void;
  /** Must be stable: the test card form reports from an effect. */
  onTestCardValidityChange: (isValid: boolean) => void;
};

export function SignupPaymentSection({
  options,
  isLoading,
  isError,
  errorMessage,
  outdatedFunction,
  onRetry,
  packageId,
  onPackageChange,
  extraHoursPackageId,
  onExtraHoursPackageChange,
  billingPeriod,
  onBillingPeriodChange,
  method,
  onMethodChange,
  details,
  issues,
  onDetailsChange,
  onTestCardValidityChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const selectedPackage = useMemo(
    () => options?.packages.find((item) => item.id === packageId) ?? null,
    [options?.packages, packageId],
  );
  const quote = selectedPackage ? computePackageBillingQuote(selectedPackage, billingPeriod) : null;
  const selectedExtraHoursPackage =
    options?.extraHoursPackages.find((item) => item.id === extraHoursPackageId) ?? null;
  const extraHoursQuote = selectedExtraHoursPackage
    ? computeExtraHoursDisplayPrice(selectedExtraHoursPackage)
    : null;
  const totalDue = (quote?.total ?? 0) + (extraHoursQuote?.displayPrice ?? 0);
  const totalSavings = (quote?.discountAmount ?? 0) + (extraHoursQuote?.discountAmount ?? 0);
  const periodLabel = t(
    `applications.paymentPackage.period.${billingPeriod === 'half_annual' ? 'halfAnnual' : billingPeriod}`,
    { defaultValue: billingPeriods.find((period) => period.value === billingPeriod)?.label },
  );

  const price = (amount: number) => t('invoice.egpAmount', { amount: amount.toFixed(2) });

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
      <header className="border-b border-outline-variant px-5 py-5 sm:px-7">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MaterialSymbol name="payments" size="text-xl" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold tracking-tight text-on-surface sm:text-xl">
                {t('signup.payment.title', { defaultValue: 'Tuition package and payment' })}
              </h3>
              {options?.testMode && method === 'card' ? (
                <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                  {t('signup.payment.testModeBadge', { defaultValue: 'TEST MODE · NO CHARGE' })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-on-surface-variant">
              {t('signup.payment.description', {
                defaultValue: 'Choose a package and billing period, then pay securely using the nursery’s online payment options.',
              })}
            </p>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-6">
        {isLoading ? (
          <div role="status" className="flex items-center gap-3 rounded-2xl bg-surface-container p-5 text-sm text-on-surface-variant">
            <MaterialSymbol name="progress_activity" className="animate-spin text-primary" />
            {t('common.loading')}
          </div>
        ) : isError || !options ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 p-5">
            <div className="flex items-start gap-3">
              <MaterialSymbol name="error" className="mt-0.5 text-error" />
              <div className="min-w-0 space-y-2">
                <p role="alert" className="text-sm font-medium text-error">
                  {outdatedFunction
                    ? t('signup.payment.functionNeedsDeploy', {
                        defaultValue: 'The payment service update is not deployed yet. Deploy the updated parent-signup-complete Edge Function, then retry.',
                      })
                    : t('signup.payment.loadError', {
                        defaultValue: 'Payment packages are unavailable right now. Please try again later or contact the nursery.',
                      })}
                </p>
                {errorMessage && !outdatedFunction ? (
                  <p className="break-words text-xs text-on-surface-variant">{errorMessage}</p>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  <MaterialSymbol name="refresh" size="text-base" />
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </div>
            </div>
          </div>
        ) : options.packages.length === 0 ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5 text-sm text-on-surface">
            <MaterialSymbol name="info" className="text-warning" />
            {t('applications.paymentPackage.noPackages', { defaultValue: 'No active payment packages are available yet.' })}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-6">
              <fieldset className="space-y-3">
                <legend className="mb-3 flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">1</span>
                  <span>
                    <span className="block font-semibold text-on-surface">
                      {t('signup.payment.tuitionPlan', { defaultValue: 'Tuition plan' })}
                    </span>
                    <span className="mt-0.5 block text-xs text-on-surface-variant">
                      {t('signup.payment.chooseTuitionHint', { defaultValue: 'Select the plan that best fits your family.' })}
                    </span>
                  </span>
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {options.packages.map((pkg) => {
                    const activeQuote = computePackageBillingQuote(pkg, billingPeriod);
                    const active = packageId === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onPackageChange(pkg.id)}
                        className={`group relative flex min-h-28 flex-col rounded-xl border p-4 text-start transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                          active
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-outline-variant bg-surface hover:border-primary/50'
                        }`}
                      >
                        <span className="flex w-full items-start justify-between gap-3">
                          <span className="min-w-0 font-semibold text-on-surface">{displayPackageName(pkg, isArabic)}</span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-transparent'
                            }`}
                          >
                            <MaterialSymbol name="check" size="text-xs" />
                          </span>
                        </span>
                        {activeQuote.discountAmount > 0 ? (
                          <span className="mt-2 inline-flex w-fit items-center rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                            {t('signup.payment.discountBadge', { defaultValue: 'Deal' })}
                          </span>
                        ) : null}
                        {pkg.descriptionEn || pkg.descriptionAr ? (
                          <span className="mt-1.5 block text-xs leading-5 text-on-surface-variant">
                            {isArabic ? pkg.descriptionAr || pkg.descriptionEn : pkg.descriptionEn || pkg.descriptionAr}
                          </span>
                        ) : null}
                        <span className="mt-auto flex flex-wrap items-baseline gap-2 pt-4">
                          {activeQuote.discountAmount > 0 ? (
                            <span className="text-xs text-on-surface-variant line-through">
                              {price(activeQuote.subtotal)}
                            </span>
                          ) : null}
                          <span className="text-lg font-bold tracking-tight text-on-surface">{price(activeQuote.total)}</span>
                        </span>
                        {activeQuote.discountAmount > 0 ? (
                          <span className="mt-1 block text-xs font-medium text-success">
                            {t('signup.payment.discountSaved', {
                              amount: price(activeQuote.discountAmount),
                              defaultValue: 'Discount: {{amount}} saved',
                            })}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {selectedPackage ? (
                <div className="max-w-xl space-y-2.5">
                  <Label htmlFor="signup-payment-period" className="font-semibold">
                    {t('signup.payment.billingPeriod', { defaultValue: 'Billing period' })}
                  </Label>
                  <div className="group relative">
                    <MaterialSymbol
                      name="calendar_month"
                      className="pointer-events-none absolute start-4 top-1/2 z-10 -translate-y-1/2 text-primary"
                    />
                    <Select
                      id="signup-payment-period"
                      value={billingPeriod}
                      className="h-12 cursor-pointer rounded-xl border-border-default bg-surface ps-12 pe-12 text-sm font-medium transition hover:border-primary/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                      onChange={(event) => {
                        const selectedPeriod = billingPeriods.find((period) => period.value === event.target.value);
                        if (selectedPeriod) onBillingPeriodChange(selectedPeriod.value);
                      }}
                    >
                      {billingPeriods.map((period) => {
                        const periodQuote = computePackageBillingQuote(selectedPackage, period.value);
                        const label = t(
                          `applications.paymentPackage.period.${period.value === 'half_annual' ? 'halfAnnual' : period.value}`,
                          { defaultValue: period.label },
                        );
                        return (
                          <option
                            key={period.value}
                            value={period.value}
                            className="bg-surface text-foreground"
                          >
                            {`${label} — ${price(periodQuote.total)}`}
                          </option>
                        );
                      })}
                    </Select>
                    <MaterialSymbol
                      name="expand_more"
                      className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-transform group-focus-within:rotate-180"
                    />
                  </div>
                  <p className="text-xs leading-5 text-on-surface-variant">
                    {t('signup.payment.billingPeriodHint', {
                      defaultValue: 'Your selected billing period is included in the total below.',
                    })}
                  </p>
                </div>
              ) : null}

              {options.extraHoursPackages.length > 0 || options.extraHoursHourlyPlan ? (
                <fieldset className="space-y-3">
                  <legend className="mb-3 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">2</span>
                    <span>
                      <span className="block font-semibold text-on-surface">
                        {t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })}
                      </span>
                      <span className="mt-0.5 block text-xs text-on-surface-variant">
                        {t('signup.payment.extraHoursHint')}
                      </span>
                    </span>
                  </legend>
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

            <aside className="space-y-5 border-t border-outline-variant pt-5">
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MaterialSymbol name="account_balance_wallet" />
                  </span>
                  <div>
                    <h4 className="font-semibold text-on-surface">
                      {t('signup.payment.orderSummary', { defaultValue: 'Order summary' })}
                    </h4>
                    <p className="text-xs text-on-surface-variant">
                      {t('signup.payment.pricesIncludeDiscounts', { defaultValue: 'Current package prices and discounts' })}
                    </p>
                  </div>
                </div>

                {selectedPackage && quote ? (
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="min-w-0 text-on-surface-variant">
                        <span className="block font-medium text-on-surface">{displayPackageName(selectedPackage, isArabic)}</span>
                        <span className="mt-0.5 block text-xs">{periodLabel}</span>
                      </dt>
                      <dd className="shrink-0 text-end font-medium text-on-surface">{price(quote.subtotal)}</dd>
                    </div>
                    {quote.discountAmount > 0 ? (
                      <div className="flex justify-between gap-3 text-success">
                        <dt>{t('signup.payment.discount', { defaultValue: 'Discount' })}</dt>
                        <dd>-{price(quote.discountAmount)}</dd>
                      </div>
                    ) : null}
                    {selectedExtraHoursPackage && extraHoursQuote ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="min-w-0 text-on-surface-variant">
                            <span className="block font-medium text-on-surface">
                              {isArabic
                                ? selectedExtraHoursPackage.nameAr || selectedExtraHoursPackage.nameEn
                                : selectedExtraHoursPackage.nameEn || selectedExtraHoursPackage.nameAr}
                            </span>
                          </dt>
                          <dd className="shrink-0 text-end font-medium text-on-surface">{price(selectedExtraHoursPackage.price)}</dd>
                        </div>
                        {extraHoursQuote.discountAmount > 0 ? (
                          <div className="flex justify-between gap-3 text-success">
                            <dt>{t('signup.payment.discount', { defaultValue: 'Discount' })}</dt>
                            <dd>-{price(extraHoursQuote.discountAmount)}</dd>
                          </div>
                        ) : null}
                        <p className="text-xs leading-5 text-on-surface-variant">
                          {options.extraHoursHourlyPlan
                            ? t('applications.extraHoursPackage.beyondPackage', { rate: price(options.extraHoursHourlyPlan.rate) })
                            : t('applications.extraHoursPackage.beyondPackageNoRate')}
                        </p>
                      </>
                    ) : (
                      // No package: extra time is billed later at the hourly rate, not paid now.
                      <div className="flex items-start justify-between gap-3">
                        <dt className="min-w-0 text-on-surface-variant">
                          {t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })}
                        </dt>
                        <dd className="shrink-0 text-end text-xs font-medium text-on-surface-variant">
                          {options.extraHoursHourlyPlan
                            ? t('applications.extraHoursPackage.hourlyBilledLater', { rate: price(options.extraHoursHourlyPlan.rate) })
                            : t('applications.extraHoursPackage.payPerHourBilledLater')}
                        </dd>
                      </div>
                    )}
                    <div className="border-t border-outline-variant pt-4">
                      <div className="flex items-end justify-between gap-3">
                        <dt className="font-semibold text-on-surface">
                          {t('signup.payment.totalDue', { defaultValue: 'Total due' })}
                        </dt>
                        <dd className="text-2xl font-bold tracking-tight text-primary">{price(totalDue)}</dd>
                      </div>
                      {totalSavings > 0 ? (
                        <p className="mt-2 text-end text-xs font-medium text-success">
                          {t('signup.payment.totalSavings', {
                            amount: price(totalSavings),
                            defaultValue: 'You save {{amount}}',
                          })}
                        </p>
                      ) : null}
                    </div>
                  </dl>
                ) : (
                  <p className="rounded-xl bg-surface-container px-3 py-4 text-sm text-on-surface-variant">
                    {t('signup.payment.selectPlanForTotal', { defaultValue: 'Choose a tuition plan to see your total.' })}
                  </p>
                )}
              </div>

              {options.methods.length > 0 ? (
                <PaymentMethodPicker
                  name="signup-payment-method"
                  methods={options.methods}
                  value={method}
                  onChange={onMethodChange}
                  testMode={options.testMode}
                />
              ) : (
                <p role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
                  {t('payment.noEnabledMethods')}
                </p>
              )}

              {!options.testMode && method === 'card' && options.paymobCheckoutUnavailable ? (
                <p role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
                  {t('signup.payment.cardCheckout.unavailable', {
                    defaultValue: 'Online checkout is enabled by the nursery but is not configured yet. Please contact the nursery.',
                  })}
                </p>
              ) : null}

              {options.methods.includes(method) ? (
                <PaymentMethodDetails
                  method={method}
                  details={details}
                  onChange={onDetailsChange}
                  onTestCardValidityChange={onTestCardValidityChange}
                  issues={issues}
                  settings={{
                    instapayAccountName: options.instapay.accountName,
                    instapayAccountNumber: options.instapay.accountNumber,
                    instapayQrImageUrl: options.instapay.qrImageUrl,
                    walletDestinations: options.walletDestinations,
                    instructions: options.instructions,
                  }}
                  amountLabel={price(totalDue)}
                  testMode={options.testMode}
                  idPrefix="signup-payment"
                  walletProviders={options.methods.filter(isWalletProvider)}
                  onMethodChange={onMethodChange}
                />
              ) : null}

              <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-on-surface-variant">
                <MaterialSymbol name="schedule" className="mt-0.5 text-warning" />
                <p className="leading-5">
                  {t('signup.payment.reviewNote', {
                    defaultValue: 'Submitting this request sends the application to the nursery for review. Payment is pending nursery confirmation.',
                  })}
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
