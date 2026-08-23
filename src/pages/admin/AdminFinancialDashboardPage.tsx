import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { FinancialDashboardFilters } from '@/components/admin/financial/FinancialDashboardFilters';
import { FinancialDashboardInvoiceStatus } from '@/components/admin/financial/FinancialDashboardInvoiceStatus';
import { FinancialDashboardMethodPie } from '@/components/admin/financial/FinancialDashboardMethodPie';
import { FinancialMonthlyRevenueChart } from '@/components/admin/financial/FinancialMonthlyRevenueChart';
import { FinancialDashboardRecentTransactions } from '@/components/admin/financial/FinancialDashboardRecentTransactions';
import { FinancialDashboardStatCards } from '@/components/admin/financial/FinancialDashboardStatCards';
import { FinancialDashboardTopParents } from '@/components/admin/financial/FinancialDashboardTopParents';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdminFinancialDashboard,
  type PaymentMethodFilter,
  type PaymentStatusFilter,
} from '@/hooks/useAdminFinancialDashboard';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { csvEscapeCell, pickParentDisplayName, type FinancialDashboardPreset } from '@/lib/financialDashboardHelpers';

export function AdminFinancialDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: langPref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const [preset, setPreset] = useState<FinancialDashboardPreset>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>('all');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodFilter>('all');

  const customReady = preset !== 'custom' || (Boolean(customFrom) && Boolean(customTo));

  const dash = useAdminFinancialDashboard(
    profile?.nursery_id ?? undefined,
    preset,
    customFrom || undefined,
    customTo || undefined,
    paymentStatus,
    paymentMethod,
  );

  useEffect(() => {
    if (dash.isError && dash.error) {
      toast.error(
        `${t('admin.financialDashboard.loadError')}\n${t('admin.financialDashboard.loadErrorAr')}`,
      );
    }
  }, [dash.isError, dash.error, t]);

  const nf = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const nfInt = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }),
    [i18n.language],
  );

  const methodRows = useMemo(
    () =>
      dash.revenueByMethod.map((r) => ({
        ...r,
        label: t(`admin.financialDashboard.methods.${r.method}`),
      })),
    [dash.revenueByMethod, t],
  );

  const exportCsv = () => {
    try {
      const header = [
        'paid_at',
        'amount',
        'method',
        'status',
        'parent',
        'invoice_id',
        'invoice_number',
      ].join(',');
      const fb = t('admin.financialDashboard.fallbackParent');
      const lines = dash.recentTransactions.map((r) =>
        [
          csvEscapeCell(r.paid_at),
          csvEscapeCell(String(r.amount)),
          csvEscapeCell(r.method),
          csvEscapeCell(r.status),
          csvEscapeCell(pickParentDisplayName(langPref, r.parentNameAr, r.parentNameEn, fb)),
          csvEscapeCell(r.invoice_id),
          csvEscapeCell(r.invoice_number ?? ''),
        ].join(','),
      );
      const bom = '\uFEFF';
      const blob = new Blob([bom + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-payments-${preset}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${t('admin.financialDashboard.exportDone')}\n${t('admin.financialDashboard.exportDoneAr')}`);
    } catch {
      toast.error(`${t('admin.financialDashboard.exportError')}\n${t('admin.financialDashboard.exportErrorAr')}`);
    }
  };

  const loading = Boolean(profile?.nursery_id) && customReady && dash.isPending;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="account_balance" className="text-primary" size="text-2xl" />
          {t('admin.financialDashboard.title')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/reports/financial">{t('admin.financialDashboard.openReports')}</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1"
            onClick={exportCsv}
            disabled={!customReady || loading || !dash.recentTransactions.length}
          >
            <MaterialSymbol name="download" size="text-lg" />
            {t('admin.financialDashboard.exportCsv')}
          </Button>
        </div>
      </div>

      <FinancialDashboardFilters
        preset={preset}
        onPreset={setPreset}
        customFrom={customFrom}
        onCustomFrom={setCustomFrom}
        customTo={customTo}
        onCustomTo={setCustomTo}
        paymentStatus={paymentStatus}
        onPaymentStatus={setPaymentStatus}
        paymentMethod={paymentMethod}
        onPaymentMethod={setPaymentMethod}
        customReady={customReady}
        filterRange={dash.filterRange}
      />

      {!profile?.nursery_id ? (
        <p className="text-sm text-on-surface-variant">{t('admin.children.missingNursery')}</p>
      ) : !customReady ? null : loading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
          <Skeleton className="h-64 rounded-2xl md:col-span-2" />
          <Skeleton className="h-64 rounded-2xl md:col-span-2" />
        </div>
      ) : (
        <>
          <FinancialDashboardStatCards
            revenueCurrentPeriod={dash.revenueCurrentPeriod}
            revenueChangePct={dash.revenueChangePct}
            outstandingBalance={dash.outstandingBalance}
            outstandingCount={dash.outstandingCount}
            collectionRate={dash.collectionRate}
            avgInvoiceInRange={dash.avgInvoiceInRange}
            nf={nf}
            nfInt={nfInt}
          />

          <div className="grid gap-3 xl:grid-cols-2">
            <FinancialMonthlyRevenueChart data={dash.monthlyRevenue} />
            <FinancialDashboardMethodPie data={methodRows} />
          </div>

          <FinancialDashboardInvoiceStatus buckets={dash.statusBuckets} nf={nf} />

          <FinancialDashboardTopParents
            rows={dash.topPayingParents}
            langPref={langPref}
            nf={nf}
            fallbackName={t('admin.financialDashboard.fallbackParent')}
          />

          <FinancialDashboardRecentTransactions
            rows={dash.recentTransactions}
            langPref={langPref}
            nf={nf}
            fallbackName={t('admin.financialDashboard.fallbackParent')}
          />
        </>
      )}
    </div>
  );
}
