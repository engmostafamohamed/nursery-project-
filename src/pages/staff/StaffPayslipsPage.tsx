import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePayroll } from '@/hooks/usePayroll';
import { useUserProfile } from '@/hooks/useUserProfile';
import { downloadPayslipPdf } from '@/lib/exports';

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('payroll.staffPageTitle')}</h1>
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
          {[0, 1, 2, 3].map((i) => {
            const y = new Date().getFullYear() - i;
            return <option key={y} value={String(y)}>{y}</option>;
          })}
        </select>
      </div>
      {!rows.length ? (
        <EmptyState icon="receipt_long" title={t('payroll.emptyStaffTitle')} description={t('payroll.emptyStaffDescription')} />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <article key={String(r.id)} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {new Date(String(r.pay_period_start)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-on-surface-variant">{t('payroll.total')}: EGP {Number(r.total_amount ?? 0).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{String(r.payment_status) === 'paid' ? t('payroll.status.paid') : t('payroll.status.pending')}</span>
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
                        statusLabel: String(r.payment_status) === 'paid' ? t('payroll.status.paid') : t('payroll.status.pending'),
                        paymentDate: r.payment_date ? String(r.payment_date) : null,
                      })
                    }
                  >
                    {t('payroll.downloadPdf')}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
