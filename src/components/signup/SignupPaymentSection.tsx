import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PaymentMethodDetails } from '@/components/payment/PaymentMethodDetails';
import { PaymentMethodPicker } from '@/components/payment/PaymentMethodPicker';
import { signupOptionsReady, type SignupOrder } from '@/features/parent-signup/signupOrder';
import type { SignupPaymentOptions } from '@/features/parent-signup/signupPayment';
import type { ApplicationPackageBillingPeriod } from '@/hooks/useApplicationPackagePayment';
import { formatMoneyAmount } from '@/lib/money';
import { isWalletProvider, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import type { PaymentDetails, PaymentDetailsIssue } from '@/lib/paymentMethods';

import { SignupOrderSummary } from './SignupOrderSummary';
import { SignupOptionsStatus } from './SignupOptionsStatus';

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
};

/** Sign-up payment step: the order the parent chose, then how they pay for it. */
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

      <SignupOrderSummary
        order={order}
        billingPeriod={billingPeriod}
        hourlyRate={options.extraHoursHourlyPlan?.rate ?? null}
        onChange={onChangePackages}
      />

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
          {t('signup.payment.cardCheckout.unavailable')}
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
          amountLabel={money(order.totalDue)}
          testMode={options.testMode}
          idPrefix="signup-payment"
          walletProviders={options.methods.filter(isWalletProvider)}
          onMethodChange={onMethodChange}
        />
      ) : null}

      <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-on-surface-variant">
        <MaterialSymbol name="schedule" className="mt-0.5 text-warning" />
        <p className="leading-5">{t('signup.payment.reviewNote')}</p>
      </div>
    </div>
  );
}
