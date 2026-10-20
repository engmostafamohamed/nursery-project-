import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PaymentMethodDetails } from '@/components/payment/PaymentMethodDetails';
import { PaymentMethodPicker } from '@/components/payment/PaymentMethodPicker';
import { signupOptionsReady, type SignupOrder } from '@/features/parent-signup/signupOrder';
import type { SignupPaymentOptions } from '@/features/parent-signup/signupPayment';
import type { SignUpStep } from '@/features/parent-signup/parentSignUpTypes';
import type { ApplicationPackageBillingPeriod } from '@/hooks/useApplicationPackagePayment';
import { formatMoneyAmount } from '@/lib/money';
import { isWalletProvider, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import type { PaymentDetails, PaymentDetailsIssue } from '@/lib/paymentMethods';

import { SignupOrderSummary } from './SignupOrderSummary';
import { SignupOptionsStatus } from './SignupOptionsStatus';

/** Something that still stops the submit; a step to go back to when it is there. */
export type SignupSubmitBlocker = { text: string; step?: SignUpStep };

export type SignupSubmitState = {
  label: string;
  icon: string;
  disabled: boolean;
  submitting: boolean;
  blockers: SignupSubmitBlocker[];
  onGoToStep: (step: SignUpStep) => void;
};

type Props = {
  options: SignupPaymentOptions | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  outdatedFunction: boolean;
  onRetry: () => void;
  /** What the parent picked on the packages step. */
  order: SignupOrder;
  billingPeriod: ApplicationPackageBillingPeriod;
  /** Back to the packages step. */
  onChangePackages: () => void;
  method: ParentPaymentMethodCode;
  onMethodChange: (value: ParentPaymentMethodCode) => void;
  /** What the parent entered for the chosen method (reference, wallet details, test card). */
  details: PaymentDetails;
  /** What is still missing for the chosen method. */
  issues: PaymentDetailsIssue[];
  onDetailsChange: (patch: Partial<PaymentDetails>) => void;
  /** Must be stable: the test card form reports from an effect. */
  onTestCardValidityChange: (isValid: boolean) => void;
  /** The confirm button beside the order on wide screens (the wizard's own button below covers phones). */
  submit: SignupSubmitState;
};

/**
 * Sign-up payment step. Wide screens: the payment methods on the left, and the order with its
 * total and the confirm button kept in view on the right. Phones: the order first, then the
 * methods; the wizard's submit button follows.
 */
export function SignupPaymentSection({
  options,
  isLoading,
  isError,
  errorMessage,
  outdatedFunction,
  onRetry,
  order,
  billingPeriod,
  onChangePackages,
  method,
  onMethodChange,
  details,
  issues,
  onDetailsChange,
  onTestCardValidityChange,
  submit,
}: Props) {
  const { t } = useTranslation();
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });

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

  // Reached without a plan (e.g. after changing the nursery): the order comes first.
  if (!order.complete) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5">
        <span className="flex items-start gap-3 text-sm text-on-surface">
          <MaterialSymbol name="info" className="text-warning" />
          {t('signup.packages.chooseFirst')}
        </span>
        <Button type="button" variant="outline" onClick={onChangePackages}>
          <MaterialSymbol name="workspace_premium" size="text-base" />
          {t('signup.packages.goToPackages')}
        </Button>
      </div>
    );
  }

  const hourlyRate = options.extraHoursHourlyPlan?.rate ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm leading-6 text-on-surface-variant">{t('signup.packages.payIntro')}</p>
        {options.testMode && method === 'card' ? (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
            {t('signup.payment.testModeBadge')}
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0 space-y-6">
          {/* Phones and tablets: what is being paid for, before choosing how. */}
          <SignupOrderSummary
            className="xl:hidden"
            order={order}
            billingPeriod={billingPeriod}
            hourlyRate={hourlyRate}
            onChange={onChangePackages}
          />

          {options.methods.length > 0 ? (
            <PaymentMethodPicker
              name="signup-payment-method"
              methods={options.methods}
              value={options.methods.includes(method) ? method : null}
              onChange={onMethodChange}
              testMode={options.testMode}
              disabled={submit.submitting}
              renderDetails={(selected) => (
                <div className="space-y-3">
                  {!options.testMode && selected === 'card' && options.paymobCheckoutUnavailable ? (
                    <p role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
                      {t('signup.payment.cardCheckout.unavailable')}
                    </p>
                  ) : null}
                  <PaymentMethodDetails
                    method={selected}
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
                    amountLabel={money(order.totalDue)}
                    testMode={options.testMode}
                    idPrefix="signup-payment"
                    walletProviders={options.methods.filter(isWalletProvider)}
                    onMethodChange={onMethodChange}
                  />
                </div>
              )}
            />
          ) : (
            <p role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
              {t('payment.noEnabledMethods')}
            </p>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-on-surface-variant">
            <MaterialSymbol name="schedule" className="mt-0.5 text-warning" />
            <p className="leading-5">{t('signup.payment.reviewNote')}</p>
          </div>
        </div>

        {/* Wide screens: the order, its total and the confirm button stay in view. */}
        <aside className="hidden space-y-3 xl:sticky xl:top-24 xl:block">
          <SignupOrderSummary order={order} billingPeriod={billingPeriod} hourlyRate={hourlyRate} onChange={onChangePackages} />
          <Button
            type="submit"
            className="btn-gradient h-12 w-full gap-2 text-base text-primary-foreground shadow-md shadow-primary/20"
            disabled={submit.disabled}
            aria-busy={submit.submitting}
          >
            {submit.label}
            <MaterialSymbol name={submit.icon} size="text-base" />
          </Button>
          {submit.blockers.length > 0 && !submit.submitting ? (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
              <p className="mb-1.5 text-xs font-semibold text-on-surface">{t('signup.packages.stillNeeded')}</p>
              <ul className="space-y-1" aria-live="polite">
                {submit.blockers.map((blocker) => (
                  <li key={blocker.text} className="flex items-start gap-1.5 text-xs leading-5 text-on-surface-variant">
                    <MaterialSymbol name="radio_button_unchecked" size="text-sm" className="mt-px shrink-0 text-warning" />
                    {blocker.step ? (
                      <button
                        type="button"
                        className="text-start font-medium text-primary hover:underline"
                        onClick={() => submit.onGoToStep(blocker.step as SignUpStep)}
                      >
                        {blocker.text}
                      </button>
                    ) : (
                      <span>{blocker.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-on-surface-variant">
            <MaterialSymbol name="shield" size="text-sm" />
            {t('payment.checkout.onceNote')}
          </p>
        </aside>
      </div>
    </div>
  );
}
