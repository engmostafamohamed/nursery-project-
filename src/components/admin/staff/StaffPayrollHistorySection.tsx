import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { downloadPayslipPdf } from '@/lib/exports';

type Row = Record<string, unknown>;

export function StaffPayrollHistorySection({
  rows,
  loading,
  staffName = 'Employee',
}: {
  rows: Row[];
  loading: boolean;
  staffName?: string;
}) {
  const { t, i18n } = useTranslation();

  const nf = new Intl.NumberFormat(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const onDownload = (r: Row) => {
    downloadPayslipPdf({
      staffName,
      periodStart: String(r.pay_period_start ?? '—').slice(0, 10),
      periodEnd: String(r.pay_period_end ?? '—').slice(0, 10),
      baseSalary: Number(r.base_salary ?? 0),
      bonuses: Number(r.bonuses ?? 0),
      deductions: Number(r.deductions ?? 0),
      total: Number(r.total_amount ?? 0),
      statusLabel: String(r.payment_status ?? 'pending') === 'paid' ? t('payroll.status.paid') : t('payroll.status.pending'),
      paymentDate: r.payment_date ? String(r.payment_date) : null,
    });
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full max-w-md" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!rows.length) {
    return <p className="text-sm text-on-surface-variant">{t('staff.payrollHistory.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-outline-variant">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container text-on-surface-variant">
            <th className="px-3 py-2 text-start">{t('staff.payrollHistory.period')}</th>
            <th className="px-3 py-2 text-start">{t('payroll.baseSalary')}</th>
            <th className="px-3 py-2 text-start">{t('payroll.bonuses')}</th>
            <th className="px-3 py-2 text-start">{t('payroll.deductions')}</th>
            <th className="px-3 py-2 text-start">{t('payroll.total')}</th>
            <th className="px-3 py-2 text-start">{t('payroll.paymentStatus')}</th>
            <th className="px-3 py-2 text-start">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = String(r.id ?? '');
            const start = String(r.pay_period_start ?? '').slice(0, 10);
            const end = String(r.pay_period_end ?? '').slice(0, 10);
            const paid = String(r.payment_status ?? 'pending') === 'paid';
            return (
              <tr key={id} className="border-t border-outline-variant">
                <td className="px-3 py-2">
                  {start} → {end}
                </td>
                <td className="px-3 py-2">{t('invoice.egpAmount', { amount: nf.format(Number(r.base_salary ?? 0)) })}</td>
                <td className="px-3 py-2">{t('invoice.egpAmount', { amount: nf.format(Number(r.bonuses ?? 0)) })}</td>
                <td className="px-3 py-2">{t('invoice.egpAmount', { amount: nf.format(Number(r.deductions ?? 0)) })}</td>
                <td className="px-3 py-2 font-medium">
                  {t('invoice.egpAmount', { amount: nf.format(Number(r.total_amount ?? 0)) })}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    className={
                      paid
                        ? 'border-success/40 bg-success/10 text-success'
                        : 'border-warning/40 bg-warning/10 text-warning'
                    }
                  >
                    {paid ? t('payroll.status.paid') : t('payroll.status.pending')}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onDownload(r)}>
                    <MaterialSymbol name="download" size="text-base" />
                    {t('payroll.downloadPdf')}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
