import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceStatusChart } from '@/components/admin/reports/InvoiceStatusChart';
import { InvoiceTypesChart } from '@/components/admin/reports/InvoiceTypesChart';
import { PaymentMethodsChart } from '@/components/admin/reports/PaymentMethodsChart';
import { RevenueChart } from '@/components/admin/reports/RevenueChart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useFinancialReports, type RangePreset } from '@/hooks/useFinancialReports';
import { useUserProfile } from '@/hooks/useUserProfile';
import { downloadFinancialReportCsv, downloadFinancialReportPdf, type FinancialReportInput } from '@/lib/exports';
import { sendInvoiceReminder } from '@/lib/invoiceActions';

export function AdminFinancialReportsPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const reports = useFinancialReports(profile?.nursery_id ?? undefined, preset, fromDate || undefined, toDate || undefined);
  const d = reports.data;

  const buildReportInput = (): FinancialReportInput | null => {
    if (!d) return null;
    const rangeLabel =
      preset === 'custom' && fromDate && toDate ? `${fromDate} → ${toDate}` : t(`reports.financial.presets.${preset}`);
    return {
      rangeLabel,
      metrics: {
        totalRevenue: d.totalRevenue,
        outstandingAmount: d.outstandingAmount,
        outstandingCount: d.outstandingCount,
        overdueAmount: d.overdueAmount,
        overdueCount: d.overdueCount,
        avgDaysOverdue: d.avgDaysOverdue,
        collectionRate: d.collectionRate,
      },
      statusData: d.statusData,
      typesData: d.typesData,
      topPayingParents: d.topPayingParents.map((p) => ({ parentName: p.parentName, total: p.total, count: p.count })),
      overdueInvoices: d.overdueInvoices.map((o) => ({
        invoiceNumber: o.invoiceNumber,
        parentName: o.parentName,
        amount: o.amount,
        daysOverdue: o.daysOverdue,
      })),
    };
  };

  const onQuickReminder = async (row: NonNullable<typeof d>['overdueInvoices'][number]) => {
    if (!profile?.nursery_id) return;
    try {
      await sendInvoiceReminder({
        nurseryId: profile.nursery_id,
        parentId: row.parentId,
        parentEmail: row.parentEmail,
        parentPhone: row.parentPhone,
        parentLanguage: row.parentLanguage,
        invoiceNumber: row.invoiceNumber,
        amount: row.amount,
      });
      toast.success(t('reports.financial.tables.reminderSent'));
    } catch {
      toast.error(t('reports.financial.tables.reminderError'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('reports.financial.title')}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const input = buildReportInput();
              if (input) downloadFinancialReportPdf(input, { termProgress: true });
            }}
          >
            {t('reports.financial.export.termProgress')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const input = buildReportInput();
              if (input) downloadFinancialReportCsv(input);
            }}
          >
            {t('reports.financial.export.excel')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const input = buildReportInput();
              if (input) downloadFinancialReportPdf(input);
            }}
          >
            {t('reports.financial.export.pdf')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-4">
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
          {(['this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'custom'] as const).map((p) => (
            <option key={p} value={p}>{t(`reports.financial.presets.${p}`)}</option>
          ))}
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('reports.financial.metrics.totalRevenue')}</p><p className="text-lg font-bold">{t('invoice.egpAmount', { amount: (d?.totalRevenue ?? 0).toFixed(2) })}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('reports.financial.metrics.outstanding')}</p><p className="text-lg font-bold">{t('invoice.egpAmount', { amount: (d?.outstandingAmount ?? 0).toFixed(2) })}</p><p className="text-xs text-on-surface-variant">{t('reports.financial.count', { count: d?.outstandingCount ?? 0 })}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('reports.financial.metrics.overdue')}</p><p className="text-lg font-bold text-error">{t('invoice.egpAmount', { amount: (d?.overdueAmount ?? 0).toFixed(2) })}</p><p className="text-xs text-on-surface-variant">{t('reports.financial.overdueDetails', { count: d?.overdueCount ?? 0, days: d?.avgDaysOverdue ?? 0 })}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('reports.financial.metrics.collectionRate')}</p><p className="text-lg font-bold">{(d?.collectionRate ?? 0).toFixed(1)}%</p></div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <RevenueChart data={d?.revenueOverTime ?? []} />
        <PaymentMethodsChart data={d?.paymentMethodsData ?? []} />
        <InvoiceStatusChart data={d?.statusData ?? []} />
        <InvoiceTypesChart data={d?.typesData ?? []} />
      </div>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h3 className="mb-2 text-sm font-semibold">{t('reports.financial.tables.topParents')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr className="text-on-surface-variant"><th className="px-2 py-2 text-start">{t('reports.financial.tables.parent')}</th><th className="px-2 py-2 text-start">{t('reports.financial.tables.totalPaid')}</th><th className="px-2 py-2 text-start">{t('reports.financial.tables.invoiceCount')}</th><th className="px-2 py-2 text-start">{t('reports.financial.tables.lastPayment')}</th></tr></thead>
            <tbody>
              {(d?.topPayingParents ?? []).map((row) => (
                <tr key={row.parentId} className="border-t border-outline-variant">
                  <td className="px-2 py-2">{row.parentName}</td>
                  <td className="px-2 py-2">{t('invoice.egpAmount', { amount: row.total.toFixed(2) })}</td>
                  <td className="px-2 py-2">{row.count}</td>
                  <td className="px-2 py-2">{row.lastPaid ? new Date(row.lastPaid).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h3 className="mb-2 text-sm font-semibold">{t('reports.financial.tables.overdueInvoices')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-on-surface-variant"><th className="px-2 py-2 text-start">{t('invoice.table.invoiceNo')}</th><th className="px-2 py-2 text-start">{t('reports.financial.tables.parent')}</th><th className="px-2 py-2 text-start">{t('invoice.table.amount')}</th><th className="px-2 py-2 text-start">{t('reports.financial.tables.daysOverdue')}</th><th className="px-2 py-2 text-start">{t('invoice.table.actions')}</th></tr></thead>
            <tbody>
              {(d?.overdueInvoices ?? []).map((row) => (
                <tr key={row.id} className="border-t border-outline-variant">
                  <td className="px-2 py-2">{row.invoiceNumber}</td>
                  <td className="px-2 py-2">{row.parentName}</td>
                  <td className="px-2 py-2">{t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}</td>
                  <td className="px-2 py-2">{row.daysOverdue}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm"><Link to={`/admin/invoices/${row.id}${qs}`}>{t('invoice.actions.viewDetails')}</Link></Button>
                      <Button variant="outline" size="sm" onClick={() => void onQuickReminder(row)}>{t('reports.financial.tables.sendReminder')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
