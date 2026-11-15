import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, StatusPill, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { usePayroll } from '@/hooks/usePayroll';
import { useUserProfile } from '@/hooks/useUserProfile';
import { downloadPayslipPdf } from '@/lib/exports';
import { formatMoneyAmount } from '@/lib/money';

export function StaffPayslipsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const staffName = String(
    (i18n.language?.startsWith('ar') ? profile?.name_ar : profile?.name_en) ?? profile?.name_en ?? profile?.name_ar ?? 'Employee',
  );
  const [year, setYear] = useState(new Date().getFullYear());
  const payroll = usePayroll(undefined, user?.id);

  const rows = payroll.staffRows.filter((r) => new Date(String(r.pay_period_start)).getFullYear() === year);
  const pager = usePagination(rows, 10, `${year}|${rows.length}`);
  const money = (n: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(n) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('payroll.staffPageTitle')}</h1>
        <Select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
          {[0, 1, 2, 3].map((i) => {
            const y = new Date().getFullYear() - i;
            return <option key={y} value={String(y)}>{y}</option>;
          })}
        </Select>
      </div>
      {!rows.length ? (
        <EmptyState icon="receipt_long" title={t('payroll.emptyStaffTitle')} description={t('payroll.emptyStaffDescription')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={720}>
            <THead>
              <Th>{t('payroll.payslipsTable.month')}</Th>
              <Th align="end">{t('payroll.payslipsTable.base')}</Th>
              <Th align="end">{t('payroll.payslipsTable.bonuses')}</Th>
              <Th align="end">{t('payroll.payslipsTable.deductions')}</Th>
              <Th align="end">{t('payroll.total')}</Th>
              <Th>{t('payroll.payslipsTable.status')}</Th>
              <Th align="end"><span className="sr-only">{t('payroll.downloadPdf')}</span></Th>
            </THead>
            <TBody>
              {pager.pageItems.map((r) => {
                const paid = String(r.payment_status) === 'paid';
                return (
                  <Tr key={String(r.id)} data-testid="payslip-row">
                    <Td className="whitespace-nowrap font-semibold text-on-surface">
                      {new Date(String(r.pay_period_start)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-on-surface-variant">{money(Number(r.base_salary ?? 0))}</Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-on-surface-variant">{money(Number(r.bonuses ?? 0))}</Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-on-surface-variant">{money(Number(r.deductions ?? 0))}</Td>
                    <Td align="end" className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{money(Number(r.total_amount ?? 0))}</Td>
                    <Td>
                      <StatusPill tone={paid ? 'success' : 'warning'}>{paid ? t('payroll.status.paid') : t('payroll.status.pending')}</StatusPill>
                    </Td>
                    <Td align="end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadPayslipPdf({
                            staffName,
                            periodStart: String(r.pay_period_start ?? '—').slice(0, 10),
                            periodEnd: String(r.pay_period_end ?? '—').slice(0, 10),
                            baseSalary: Number(r.base_salary ?? 0),
                            bonuses: Number(r.bonuses ?? 0),
                            deductions: Number(r.deductions ?? 0),
                            total: Number(r.total_amount ?? 0),
                            statusLabel: paid ? t('payroll.status.paid') : t('payroll.status.pending'),
                            paymentDate: r.payment_date ? String(r.payment_date) : null,
                          })
                        }
                      >
                        {t('payroll.downloadPdf')}
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}
    </div>
  );
}
