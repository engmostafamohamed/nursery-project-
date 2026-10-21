import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  IconAction,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { usePayroll } from '@/hooks/usePayroll';
import { useUserProfile } from '@/hooks/useUserProfile';
import { downloadPayslipPdf } from '@/lib/exports';
import { newIdempotencyKey } from '@/lib/paymentApi';
import { readableCode } from '@/lib/readableCode';

export function AdminPayrollPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const bulkOperationKeys = useRef<{
    generate?: { fingerprint: string; key: string };
    paid?: { fingerprint: string; key: string };
  }>({});
  const payrollPaymentKeys = useRef(new Map<string, string>());
  const payroll = usePayroll(profile?.nursery_id ?? undefined, undefined, { month, department, status, search });

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
    const fingerprint = `${profile.nursery_id}:${month}`;
    if (bulkOperationKeys.current.generate?.fingerprint !== fingerprint) {
      bulkOperationKeys.current.generate = { fingerprint, key: newIdempotencyKey() };
    }
    try {
      const n = await payroll.generateMonthlyPayrollForAll({
        nurseryId: profile.nursery_id,
        month,
        idempotencyKey: bulkOperationKeys.current.generate.key,
      });
      delete bulkOperationKeys.current.generate;
      toast.success(t('payroll.bulkGenerateDone', { count: n }));
    } catch {
      toast.error(t('payroll.actionError'));
    }
  };

  const onBulkPaid = async () => {
    if (!profile?.nursery_id) return;
    const fingerprint = `${profile.nursery_id}:${month}`;
    if (bulkOperationKeys.current.paid?.fingerprint !== fingerprint) {
      bulkOperationKeys.current.paid = { fingerprint, key: newIdempotencyKey() };
    }
    try {
      const n = await payroll.bulkMarkPendingPaidForMonth({
        nurseryId: profile.nursery_id,
        month,
        idempotencyKey: bulkOperationKeys.current.paid.key,
      });
      delete bulkOperationKeys.current.paid;
      toast.success(t('payroll.bulkMarkPaidDone', { count: n }));
    } catch {
      toast.error(t('payroll.actionError'));
    }
  };

  const onMarkPaid = async (payrollId: string) => {
    const key = payrollPaymentKeys.current.get(payrollId) ?? newIdempotencyKey();
    payrollPaymentKeys.current.set(payrollId, key);
    try {
      await payroll.markPaid({ id: payrollId, idempotencyKey: key });
      payrollPaymentKeys.current.delete(payrollId);
      toast.success(t('payroll.status.paid'));
    } catch {
      toast.error(t('payroll.actionError'));
    }
  };

  const loading = Boolean(profile?.nursery_id) && payroll.isLoading;

  const filtersActive = department !== 'all' || status !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setDepartment('all');
    setStatus('all');
    setSearch('');
  };
  const toggleStatus = (value: 'paid' | 'pending') => setStatus((current) => (current === value ? 'all' : value));
  const pager = usePagination(payroll.adminRows, 10, `${month}|${department}|${status}|${search.trim().toLowerCase()}`);
  const isArabic = i18n.language.startsWith('ar');

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="payments"
        title={t('payroll.dashboardTitle')}
        description={t('payroll.statsHint')}
        actions={
          <Button asChild>
            <Link to="/admin/staff/payroll/new" className="gap-1">
              <MaterialSymbol name="add" size="text-lg" />
              {t('payroll.generatePayslip')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="account_balance" label={t('payroll.totalThisMonth')} value={t('invoice.egpAmount', { amount: nf.format(payroll.stats.total) })} />
          <StatTile
            icon="task_alt"
            label={t('payroll.paidCount')}
            value={payroll.stats.paidCount}
            tone="success"
            onClick={() => toggleStatus('paid')}
            active={status === 'paid'}
          />
          <StatTile
            icon="pending_actions"
            label={t('payroll.pendingCountLabel')}
            value={payroll.stats.pendingCount}
            tone={payroll.stats.pendingCount > 0 ? 'warning' : 'success'}
            onClick={() => toggleStatus('pending')}
            active={status === 'pending'}
          />
          <StatTile icon="payments" label={t('payroll.paidThisMonth')} value={t('invoice.egpAmount', { amount: nf.format(payroll.stats.paidTotal) })} tone="success" />
        </div>
      </PageHeader>

      <TableCard
        title={t('payroll.dashboardTitle')}
        count={loading ? undefined : t('staff.directory.resultsCount', { count: payroll.adminRows.length })}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void onBulkGenerate()}>
              <MaterialSymbol name="group_add" size="text-base" />
              {t('payroll.bulkGenerate')}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void onBulkPaid()}>
              <MaterialSymbol name="check_circle" size="text-base" />
              {t('payroll.bulkMarkPaid')}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={exportCsv} disabled={!payroll.adminRows.length}>
              <MaterialSymbol name="download" size="text-base" />
              {t('payroll.exportPayrollCsv')}
            </Button>
          </>
        }
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('payroll.periodMonth')}>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || month)} />
            </FilterField>
            <FilterField label={t('staff.department')}>
              <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="all">{t('staff.allDepartments')}</option>
                {(['teaching', 'admin', 'kitchen', 'maintenance', 'security', 'driver'] as const).map((d) => (
                  <option key={d} value={d}>
                    {t(`staff.departments.${d}`)}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('payroll.paymentStatus')}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">{t('common.all')}</option>
                <option value="pending">{t('payroll.status.pending')}</option>
                <option value="paid">{t('payroll.status.paid')}</option>
              </Select>
            </FilterField>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('payroll.searchByName')} />
            </FilterField>
          </FilterBar>
        }
        pagination={loading || !payroll.adminRows.length ? null : <TablePagination pager={pager} />}
      >
        {loading ? (
          <TableLoading />
        ) : !payroll.adminRows.length ? (
          <TableEmpty icon="payments" title={t('payroll.emptyTitle')} description={t('payroll.emptyDescription')} />
        ) : (
          <DataTable minWidth={1040}>
            <THead>
              <Th>{t('payroll.staff')}</Th>
              <Th align="end">{t('payroll.baseSalary')}</Th>
              <Th align="end">{t('payroll.bonuses')}</Th>
              <Th align="end">{t('payroll.deductions')}</Th>
              <Th align="end">{t('payroll.total')}</Th>
              <Th>{t('payroll.paymentStatus')}</Th>
              <Th align="end">{t('common.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((row) => {
                const profileRow = row.profile as Record<string, unknown>;
                const userRow = (row.user as Record<string, unknown> | null) ?? {};
                const payrollRow = (row.payroll as Record<string, unknown> | null) ?? {};
                const localName = isArabic ? userRow.name_ar ?? userRow.name_en : userRow.name_en ?? userRow.name_ar;
                const name = String(localName ?? profileRow.employee_id ?? '-');
                const position = readableCode(String(profileRow.position ?? ''));
                const amount = Number(payrollRow.total_amount ?? (Number(profileRow.salary_amount ?? 0)));
                const isPaid = String(payrollRow.payment_status ?? 'pending') === 'paid';
                const money = (value: number) => t('invoice.egpAmount', { amount: nf.format(value) });
                return (
                  <Tr key={String(profileRow.id)}>
                    <Td>
                      <p className="font-semibold text-on-surface">{name}</p>
                      {position ? <p className="text-xs text-on-surface-variant">{position}</p> : null}
                    </Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-on-surface">
                      {money(Number(payrollRow.base_salary ?? profileRow.salary_amount ?? 0))}
                    </Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-success">{money(Number(payrollRow.bonuses ?? 0))}</Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-error">{money(Number(payrollRow.deductions ?? 0))}</Td>
                    <Td align="end" className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{money(amount)}</Td>
                    <Td>
                      <StatusPill tone={isPaid ? 'success' : 'warning'}>
                        {isPaid ? t('payroll.status.paid') : t('payroll.status.pending')}
                      </StatusPill>
                    </Td>
                    <Td align="end">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction
                          icon="picture_as_pdf"
                          label={`${t('payroll.downloadPdf')}: ${name}`}
                          onClick={() =>
                            downloadPayslipPdf({
                              staffName: name,
                              position,
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
                        />
                        {!isPaid && payrollRow.id ? (
                          <Button size="sm" type="button" variant="outline" className="gap-1" onClick={() => void onMarkPaid(String(payrollRow.id))}>
                            <MaterialSymbol name="check" size="text-base" />
                            {t('payroll.markPaid')}
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>
    </div>
  );
}
