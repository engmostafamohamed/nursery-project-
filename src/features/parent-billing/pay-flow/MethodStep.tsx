import { useTranslation } from 'react-i18next';

import { PaymentMethodDetails } from '@/components/payment/PaymentMethodDetails';
import { PaymentMethodPicker } from '@/components/payment/PaymentMethodPicker';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { InvoiceCheckout } from '@/hooks/useInvoiceCheckout';
import { formatMoneyAmount } from '@/lib/money';
import { isWalletProvider } from '@/lib/paymentApi';

/** How to pay: the methods the nursery accepts, and the details the chosen one needs. */
export function MethodStep({ checkout }: { checkout: InvoiceCheckout }) {
  const { t } = useTranslation();

  if (checkout.isLoadingMethods) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
        <MaterialSymbol name="progress_activity" className="animate-spin text-primary" />
        {t('common.loading')}
      </div>
    );
  }
  if (checkout.methods.length === 0) {
    return (
      <p role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
        {t('payment.noEnabledMethods')}
      </p>
    );
  }
  return (
    <PaymentMethodPicker
      name="pay-flow-method"
      methods={checkout.methods}
      value={checkout.method}
      onChange={checkout.selectMethod}
      testMode={checkout.testMode}
      disabled={checkout.submitting}
      renderDetails={(method) => (
        <PaymentMethodDetails
          method={method}
          details={checkout.details}
          onChange={checkout.updateDetails}
          onTestCardValidityChange={checkout.setTestCardValid}
          issues={checkout.issues}
          settings={checkout.settings}
          amountLabel={t('invoice.egpAmount', { amount: formatMoneyAmount(checkout.amountValid ? checkout.amount : 0) })}
          testMode={checkout.testMode}
          idPrefix="pay-flow"
          walletProviders={checkout.methods.filter(isWalletProvider)}
          onMethodChange={checkout.selectMethod}
        />
      )}
    />
  );
}
