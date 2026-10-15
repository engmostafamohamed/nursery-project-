import { useTranslation } from 'react-i18next';

import { PaymentMethodDetails } from '@/components/payment/PaymentMethodDetails';
import { PaymentMethodPicker } from '@/components/payment/PaymentMethodPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  useInvoiceCheckout,
  type CheckoutAmountPolicy,
  type CheckoutInvoice,
} from '@/hooks/useInvoiceCheckout';
import { isWalletProvider, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import { PAYMENT_DETAILS_ISSUE_KEYS, paymentFlowOf } from '@/lib/paymentMethods';
import { cn } from '@/lib/utils';

type Props = {
  /** Null while the invoice loads; the panel stays disabled until it arrives. */
  invoice: CheckoutInvoice | null;
  amountPolicy: CheckoutAmountPolicy;
  /** In-app `/parent/...` path Paymob returns the parent to after online checkout. */
  returnPath: string;
  /** Runs before the confirmation; return false to stop. */
  beforePay?: () => Promise<boolean>;
  onSubmitted?: (result: { duplicate: boolean }) => void;
  /** Single-column layout for narrow side panels. */
  compact?: boolean;
  /** Namespace for input ids and the radio group; unique per page. */
  idPrefix?: string;
  /** Method selected at first, when offered. Remount (change `key`) to apply a new one. */
  initialMethod?: ParentPaymentMethodCode | null;
  className?: string;
};

const QUICK_AMOUNT_FRACTIONS = [
  { fraction: 1, key: 'payment.fullBalance', defaultValue: 'Full balance' },
  { fraction: 0.5, key: 'payment.halfBalance', defaultValue: 'Half' },
  { fraction: 0.25, key: 'payment.quarterBalance', defaultValue: 'Quarter' },
] as const;

/**
 * Pay an invoice with any method the nursery offers: the amount, the method cards, the
 * method's own instructions and proof fields, and one pay button. Used wherever a parent pays.
 */
export function InvoiceCheckoutPanel({
  invoice,
  amountPolicy,
  returnPath,
  beforePay,
  onSubmitted,
  compact = false,
  idPrefix = 'invoice-checkout',
  initialMethod = null,
  className,
}: Props) {
  const { t } = useTranslation();
  const checkout = useInvoiceCheckout({ invoice, amountPolicy, returnPath, beforePay, onSubmitted, initialMethod });
  const amountLabel = t('invoice.egpAmount', { amount: (checkout.amountValid ? checkout.amount : 0).toFixed(2) });
  const redirectsToProvider = checkout.method !== null && paymentFlowOf(checkout.method) === 'online_checkout' && !checkout.testMode;
  const pendingHints = [
    ...(checkout.amountValid ? [] : [t('payment.invalidPartialAmount', { defaultValue: 'Enter an amount greater than 0 and not more than the balance.' })]),
    ...checkout.issues.map((issue) => t(PAYMENT_DETAILS_ISSUE_KEYS[issue])),
  ];

  return (
    <div className={cn('space-y-5', className)}>
      {amountPolicy === 'full' ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase text-primary">{t('payment.checkout.fullAmountLabel')}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-on-surface">
            {t('invoice.egpAmount', { amount: checkout.payable.toFixed(2) })}
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-on-surface-variant">
            <MaterialSymbol name="info" size="text-sm" className="mt-0.5" />
            {t('payment.checkout.fullAmountHint')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-amount`}>{t('payment.amountToPay', { defaultValue: 'Amount to pay' })}</Label>
            <Input
              id={`${idPrefix}-amount`}
              type="number"
              min={1}
              max={checkout.payable || undefined}
              step={0.01}
              value={checkout.amountText}
              aria-invalid={!checkout.amountValid}
              onChange={(event) => checkout.setAmountText(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_AMOUNT_FRACTIONS.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                variant="outline"
                size="sm"
                disabled={checkout.payable <= 0}
                onClick={() => checkout.setAmountText(Math.max(1, checkout.payable * preset.fraction).toFixed(2))}
              >
                {t(preset.key, { defaultValue: preset.defaultValue })}
              </Button>
            ))}
          </div>
        </div>
      )}

      {checkout.isLoadingMethods ? (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
          <MaterialSymbol name="progress_activity" className="animate-spin text-primary" />
          {t('common.loading')}
        </div>
      ) : checkout.methods.length === 0 ? (
        <p role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
          {t('payment.noEnabledMethods')}
        </p>
      ) : (
        <PaymentMethodPicker
          name={`${idPrefix}-method`}
          methods={checkout.methods}
          value={checkout.method}
          onChange={checkout.selectMethod}
          testMode={checkout.testMode}
          disabled={checkout.submitting}
          compact={compact}
        />
      )}

      {checkout.method && !checkout.isLoadingMethods ? (
        <PaymentMethodDetails
          method={checkout.method}
          details={checkout.details}
          onChange={checkout.updateDetails}
          onTestCardValidityChange={checkout.setTestCardValid}
          issues={checkout.issues}
          settings={checkout.settings}
          amountLabel={amountLabel}
          testMode={checkout.testMode}
          idPrefix={idPrefix}
          walletProviders={checkout.methods.filter(isWalletProvider)}
          onMethodChange={checkout.selectMethod}
        />
      ) : null}

      <div className="space-y-2">
        <Button
          type="button"
          className="h-12 w-full gap-2 rounded-md text-base"
          disabled={!checkout.canPay}
          aria-busy={checkout.submitting}
          onClick={() => void checkout.pay()}
        >
          <MaterialSymbol name={checkout.submitting ? 'hourglass_top' : redirectsToProvider ? 'lock' : 'payments'} size="text-lg" />
          {checkout.submitting
            ? t('payment.submitting')
            : redirectsToProvider
              ? t('payment.checkout.continueToCheckout', { amount: amountLabel })
              : t('payment.payNowAmount', { amount: (checkout.amountValid ? checkout.amount : 0).toFixed(2) })}
        </Button>
        {invoice && checkout.method && pendingHints.length > 0 ? (
          <ul className="space-y-1 text-xs text-on-surface-variant" aria-live="polite">
            {pendingHints.map((hint) => (
              <li key={hint} className="flex items-start gap-1.5">
                <MaterialSymbol name="radio_button_unchecked" size="text-sm" className="mt-px" />
                {hint}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-on-surface-variant">
          <MaterialSymbol name="shield" size="text-sm" />
          {t('payment.checkout.onceNote')}
        </p>
      </div>
    </div>
  );
}
