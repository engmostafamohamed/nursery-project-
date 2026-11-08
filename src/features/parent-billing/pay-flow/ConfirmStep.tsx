import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { InvoiceCheckout } from '@/hooks/useInvoiceCheckout';
import { formatMoneyAmount } from '@/lib/money';
import { paymentFlowOf } from '@/lib/paymentMethods';

/** The payment as it will be sent: read it once more, then send. */
export function ConfirmStep({ checkout, invoiceNumber, discount }: { checkout: InvoiceCheckout; invoiceNumber: string; discount: number }) {
  const { t } = useTranslation();
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const method = checkout.method;
  const flow = method ? paymentFlowOf(method) : null;
  const redirects = flow === 'online_checkout' && !checkout.testMode;

  const rows: Array<[string, string]> = [
    [t('parentBilling.confirm.invoice'), invoiceNumber],
    ...(discount > 0 ? ([[t('parentBilling.confirm.pointsDiscount'), `− ${money(discount)}`]] as Array<[string, string]>) : []),
    [t('parentBilling.confirm.method'), method ? t(`payment.manualMethods.${method}.label`) : '—'],
    ...(flow === 'transfer' && checkout.details.reference.trim()
      ? ([[t('parentBilling.confirm.reference'), checkout.details.reference.trim()]] as Array<[string, string]>)
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
        <p className="text-sm text-on-surface-variant">{t('parentBilling.confirm.youPay')}</p>
        <p className="mt-1 text-3xl font-bold text-on-surface" data-testid="confirm-amount">
          {money(checkout.amountValid ? checkout.amount : 0)}
        </p>
      </div>
      <dl className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-on-surface-variant">{label}</dt>
            <dd className="text-end font-medium text-on-surface">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="flex items-start gap-1.5 text-sm text-on-surface-variant">
        <MaterialSymbol name={redirects ? 'open_in_new' : 'hourglass_top'} size="text-base" className="mt-0.5" />
        {redirects ? t('payment.checkout.redirectNote') : t('parentBilling.confirm.reviewNote')}
      </p>
    </div>
  );
}
