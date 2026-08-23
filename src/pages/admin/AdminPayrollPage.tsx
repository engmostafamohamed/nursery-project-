import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePayroll } from '@/hooks/usePayroll';
import { useUserProfile } from '@/hooks/useUserProfile';
import { downloadPayslipPdf } from '@/lib/exports';

export function AdminPayrollPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const payroll = usePayroll(profile?.nursery_id ?? undefined, undefined, { month, department, status, search });

  const monthLabel = useMemo(
    () => new Date(`${month}-01T00:00:00`).toLocaleDateString(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' }),
    [month, i18n.language],
  );

  const nf = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const exportCsv = () => {
    try {
      const lines = payroll.adminRows.map((row) => {
        const pr = row.profile as Record<string, unknown>;
        const u = (row.user as Record<string, unknown> | null) ?? {};
        const py = (row.payroll as Record<string, unknown> | null) ?? {};
        const name = String(u.name_ar ?? u.name_en ?? '');
        return {
          staff: name,
          employee_id: pr.employee_id,
          base: py.base_salary ?? pr.salary_amount,
          bonuses: py.bonuses,
          deductions: py.deductions,
          total: py.total_amount,
          status: py.payment_status ?? 'pending',
        };
      });
      const csv = Papa.unparse(lines);
      const bom = '\uFEFF';
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${t('payroll.exportDone')}\n${t('payroll.exportDoneAr')}`);
    } catch {
      toast.error(t('payroll.exportError'));
    }
  };

  const onBulkGenerate = async () => {
    if (!profile?.nursery_id) return;
    try {
      const n = await payroll.generateMonthlyPayrollForAll({
        nurseryId: profile.nursery_id,
        month,
        createdBy: user?.id,
      });
      toast.success(t('payroll.bulkGenerateDone', { count: n }));
    } catch {
      toast.error(t('payroll.actionError'));
    }
  };

  const onBulkPaid = async () => {
    if (!profile?.nursery_id) return;
    try {
      const n = await payroll.bulkMarkPendingPaidForMonth({
        nurseryId: profile.nursery_id,
        month,
        paidBy: user?.id,
      });
      toast.success(t('payroll.bulkMarkPaidDone', { count: n }));
    } catch {
      toast.error(t('payroll.actionError'));
    }
  };

  const loading = Boolean(profile?.nursery_id) && payroll.isLoading;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="payments" className="text-primary" size="text-2xl" />
          {t('payroll.dashboardTitle')}
        </h1>
        <Button asChild>
          <Link to="/admin/staff/payroll/new" className="gap-1">
            <MaterialSymbol name="add" size="text-lg" />
            {t('payroll.generatePayslip')}
          </Link>
        </Button>
      </div>

      <p className="text-xs text-on-surface-variant">{t('payroll.statsHint')}</p>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs">{t('payroll.totalThisMonth')}</p>
          <p className="text-lg font-bold">{t('invoice.egpAmount', { amount: nf.format(payroll.stats.total) })}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs">{t('payroll.paidCount')}</p>
          <p className="text-lg font-bold">{payroll.stats.paidCount}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs">{t('payroll.pendingCountLabel')}</p>
          <p className="text-lg font-bold">{payroll.stats.pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs">{t('payroll.paidThisMonth')}</p>
          <p className="text-lg font-bold">{t('invoice.egpAmount', { amount: nf.format(payroll.stats.paidTotal) })}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-1" onClick={() => void onBulkGenerate()}>
          <MaterialSymbol name="group_add" size="text-lg" />
          {t('payroll.bulkGenerate')}
        </Button>
        <Button type="button" variant="outline" className="gap-1" onClick={() => void onBulkPaid()}>
          <MaterialSymbol name="check_circle" size="text-lg" />
          {t('payroll.bulkMarkPaid')}
        </Button>
        <Button type="button" variant="outline" className="gap-1" onClick={exportCsv} disabled={!payroll.adminRows.length}>
          <MaterialSymbol name="download" size="text-lg" />
          {t('payroll.exportPayrollCsv')}
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-4">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="all">{t('staff.allDepartments')}</option>
          {(['teaching', 'admin', 'kitchen', 'maintenance', 'security', 'driver'] as const).map((d) => (
            <option key={d} value={d}>
              {t(`staff.departments.${d}`)}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t('common.all')}</option>
          <option value="pending">{t('payroll.status.pending')}</option>
          <option value="paid">{t('payroll.status.paid')}</option>
        </Select>
        <Input placeholder={t('payroll.searchByName')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : !payroll.adminRows.length ? (
        <EmptyState icon="payments" title={t('payroll.emptyTitle')} description={t('payroll.emptyDescription')} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-surface-container text-on-surface-variant">
                <th className="px-3 py-2 text-start">{t('payroll.staff')}</th>
                <th className="px-3 py-2 text-start">{t('staff.position')}</th>
                <th className="px-3 py-2 text-start">{t('payroll.baseSalary')}</th>
                <th className="px-3 py-2 text-start">{t('payroll.bonuses')}</th>
                <th className="px-3 py-2 text-start">{t('payroll.deductions')}</th>
                <th className="px-3 py-2 text-start">{t('payroll.total')}</th>
                <th className="px-3 py-2 text-start">{t('payroll.paymentStatus')}</th>
                <th className="px-3 py-2 text-start">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {payroll.adminRows.map((row) => {
                const profileRow = row.profile as Record<string, unknown>;
                const userRow = (row.user as Record<string, unknown> | null) ?? {};
                const payrollRow = (row.payroll as Record<string, unknown> | null) ?? {};
                const name = String(userRow.name_ar ?? userRow.name_en ?? profileRow.employee_id ?? '-');
                const amount = Number(payrollRow.total_amount ?? (Number(profileRow.salary_amount ?? 0)));
                const isPaid = String(payrollRow.payment_status ?? 'pending') === 'paid';
                return (
                  <tr key={String(profileRow.id)} className="border-t border-outline-variant">
                    <td className="px-3 py-2">{name}</td>
                    <td className="px-3 py-2">{String(profileRow.position ?? '-')}</td>
                    <td className="px-3 py-2">
                      {t('invoice.egpAmount', { amount: nf.format(Number(payrollRow.base_salary ?? profileRow.salary_amount ?? 0)) })}
                    </td>
                    <td className="px-3 py-2">{t('invoice.egpAmount', { amount: nf.format(Number(payrollRow.bonuses ?? 0)) })}</td>
                    <td className="px-3 py-2">{t('invoice.egpAmount', { amount: nf.format(Number(payrollRow.deductions ?? 0)) })}</td>
                    <td className="px-3 py-2 font-semibold">{t('invoice.egpAmount', { amount: nf.format(amount) })}</td>
                    <td className="px-3 py-2">
                      <Badge
                        className={
                          isPaid
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-warning/40 bg-warning/10 text-warning'
                        }
                      >
                        {isPaid ? t('payroll.status.paid') : t('payroll.status.pending')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          className="gap-1"
                          onClick={() =>
                            downloadPayslipPdf({
                              staffName: name,
                              position: String(profileRow.position ?? ''),
                              periodStart: String(payrollRow.pay_period_start ?? '—').slice(0, 10),
                              periodEnd: String(payrollRow.pay_period_end ?? '—').slice(0, 10),
                              baseSalary: Number(payrollRow.base_salary ?? profileRow.salary_amount ?? 0),
                              bonuses: Number(payrollRow.bonuses ?? 0),
                              deductions: Number(payrollRow.deductions ?? 0),
                              total: amount,
                              statusLabel: isPaid ? t('payroll.status.paid') : t('payroll.status.pending'),
                              paymentDate: payrollRow.payment_date ? String(payrollRow.payment_date) : null,
                            })
                          }
                        >
                          <MaterialSymbol name="picture_as_pdf" size="text-base" />
                          {t('payroll.downloadPdf')}
                        </Button>
                        {!isPaid && payrollRow.id ? (
                          <Button
                            size="sm"
                            type="button"
                            onClick={() =>
                              void payroll.markPaid({
                                id: String(payrollRow.id),
                                paidBy: user?.id,
                                staffUserId: String(profileRow.user_id),
                                nurseryId: profile?.nursery_id ?? undefined,
                                amount,
                                monthText: monthLabel,
                              })
                            }
                          >
                            {t('payroll.markPaid')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
