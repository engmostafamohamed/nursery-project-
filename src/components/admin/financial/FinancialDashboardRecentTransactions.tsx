import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import type { NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { pickParentDisplayName } from '@/lib/financialDashboardHelpers';

type Row = {
  id: string;
  paid_at: string;
  amount: number;
  method: string;
  invoice_id: string;
  invoice_number: string | null;
  parentNameAr: string | null;
  parentNameEn: string | null;
};

export function FinancialDashboardRecentTransactions({
  rows,
  langPref,
  nf,
  fallbackName,
}: {
  rows: Row[];
  langPref: NurseryLanguagePref;
  nf: Intl.NumberFormat;
  fallbackName: string;
}) {
  const { t } = useTranslation();

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{t('admin.financialDashboard.recentTitle')}</h3>
      {rows.length === 0 ? (
        <EmptyState
          icon="payments"
          title={t('admin.financialDashboard.empty.transactionsTitle')}
          description={t('admin.financialDashboard.empty.transactionsDescription')}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="px-3 py-2 text-start">{t('admin.financialDashboard.table.date')}</th>
                <th className="px-3 py-2 text-start">{t('admin.financialDashboard.table.parent')}</th>
                <th className="px-3 py-2 text-start">{t('admin.financialDashboard.table.amount')}</th>
                <th className="px-3 py-2 text-start">{t('admin.financialDashboard.table.method')}</th>
                <th className="px-3 py-2 text-start">{t('admin.financialDashboard.table.invoice')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-outline-variant">
                  <td className="px-3 py-2">{new Date(r.paid_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {pickParentDisplayName(langPref, r.parentNameAr, r.parentNameEn, fallbackName)}
                  </td>
                  <td className="px-3 py-2">{t('invoice.egpAmount', { amount: nf.format(r.amount) })}</td>
                  <td className="px-3 py-2">
                    {t(`payment.methods.${r.method}`, { defaultValue: r.method })}
                  </td>
                  <td className="px-3 py-2">
                    <Button asChild variant="ghost" className="h-auto min-h-0 px-0 py-0 text-sm text-primary">
                      <Link to={`/admin/invoices/${r.invoice_id}`}>
                        {r.invoice_number ?? r.invoice_id.slice(0, 8)}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
