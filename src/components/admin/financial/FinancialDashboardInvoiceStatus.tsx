import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';

type Bucket = { status: 'pending' | 'overdue' | 'paid' | 'cancelled'; count: number; amount: number };

export function FinancialDashboardInvoiceStatus({ buckets, nf }: { buckets: Bucket[]; nf: Intl.NumberFormat }) {
  const { t } = useTranslation();

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('admin.financialDashboard.invoiceStatus.title')}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((b) => (
          <Card key={b.status}>
            <CardContent className="p-3">
              <p className="text-xs text-on-surface-variant">{t(`admin.financialDashboard.invoiceStatus.${b.status}`)}</p>
              <p className="text-base font-semibold">{b.count}</p>
              <p className="text-xs text-on-surface-variant">
                {t('invoice.egpAmount', { amount: nf.format(b.amount) })}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
