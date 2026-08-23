import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';

type Props = {
  revenueCurrentPeriod: number;
  revenueChangePct: number;
  outstandingBalance: number;
  outstandingCount: number;
  collectionRate: number;
  avgInvoiceInRange: number;
  nf: Intl.NumberFormat;
  nfInt: Intl.NumberFormat;
};

export function FinancialDashboardStatCards({
  revenueCurrentPeriod,
  revenueChangePct,
  outstandingBalance,
  outstandingCount,
  collectionRate,
  avgInvoiceInRange,
  nf,
  nfInt,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-on-surface-variant">{t('admin.financialDashboard.stats.revenuePeriod')}</p>
          <p className="text-lg font-bold text-on-surface">
            {t('invoice.egpAmount', { amount: nf.format(revenueCurrentPeriod) })}
          </p>
          <p className="text-xs text-on-surface-variant">
            {t('admin.financialDashboard.stats.vsPrevious', { pct: nfInt.format(revenueChangePct) })}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-on-surface-variant">{t('admin.financialDashboard.stats.outstanding')}</p>
          <p className="text-lg font-bold text-on-surface">
            {t('invoice.egpAmount', { amount: nf.format(outstandingBalance) })}
          </p>
          <p className="text-xs text-on-surface-variant">
            {t('admin.financialDashboard.stats.invoiceCount', { count: outstandingCount })}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-on-surface-variant">{t('admin.financialDashboard.stats.collectionRate')}</p>
          <p className="text-lg font-bold text-on-surface">{nfInt.format(collectionRate)}%</p>
          <p className="text-xs text-on-surface-variant">{t('admin.financialDashboard.stats.collectionHint')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-on-surface-variant">{t('admin.financialDashboard.stats.avgInvoice')}</p>
          <p className="text-lg font-bold text-on-surface">
            {t('invoice.egpAmount', { amount: nf.format(avgInvoiceInRange) })}
          </p>
          <p className="text-xs text-on-surface-variant">{t('admin.financialDashboard.stats.avgInvoiceHint')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
