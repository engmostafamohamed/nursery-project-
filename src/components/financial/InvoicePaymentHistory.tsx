import { useTranslation } from 'react-i18next';

import { formatDateTime } from '@/lib/datetime';
import type { InvoicePaymentItem } from '@/hooks/useInvoiceDetails';

type Props = {
  payments: InvoicePaymentItem[];
};

export function InvoicePaymentHistory({ payments }: Props) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-lg" aria-hidden>payments</span>
        </span>
        <h2 className="text-base font-semibold text-on-surface">{t('invoice.details.paymentHistory.title')}</h2>
      </div>
      {payments.length ? (
        <div className="space-y-3">
          {payments.map((payment) => (
            <article key={payment.id} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-on-surface">
                  {t('invoice.egpAmount', { amount: payment.amount.toFixed(2) })}
                </p>
                <span className="rounded-md border border-outline-variant px-2 py-1 text-xs font-medium text-on-surface-variant">
                  {t(`invoice.details.paymentHistory.status.${payment.status}`)}
                </span>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-on-surface-variant">{t('invoice.details.paymentHistory.method')}</dt>
                  <dd className="font-medium text-on-surface">
                    {t(`invoice.paymentMethods.${payment.method}`, { defaultValue: payment.method })}
                  </dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant">{t('invoice.details.paymentHistory.paidAt')}</dt>
                  <dd className="font-medium text-on-surface">{formatDateTime(payment.paidAt || payment.createdAt)}</dd>
                </div>
                {payment.reference ? (
                  <div className="sm:col-span-2">
                    <dt className="text-on-surface-variant">{t('invoice.details.paymentHistory.reference')}</dt>
                    <dd className="break-all font-medium text-on-surface">{payment.reference}</dd>
                  </div>
                ) : null}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">{t('invoice.details.paymentHistory.empty')}</p>
      )}
    </section>
  );
}
