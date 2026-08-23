import { useTranslation } from 'react-i18next';

import { pickParentDisplayName } from '@/lib/financialDashboardHelpers';
import type { NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';

type Row = {
  parentId: string;
  total: number;
  parentNameAr: string | null;
  parentNameEn: string | null;
};

export function FinancialDashboardTopParents({
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
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('admin.financialDashboard.topParents')}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t('admin.financialDashboard.empty.topParents')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="px-2 py-2 text-start">{t('admin.financialDashboard.table.parent')}</th>
                <th className="px-2 py-2 text-start">{t('admin.financialDashboard.table.totalPaid')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.parentId} className="border-t border-outline-variant">
                  <td className="px-2 py-2">
                    {pickParentDisplayName(langPref, row.parentNameAr, row.parentNameEn, fallbackName)}
                  </td>
                  <td className="px-2 py-2">{t('invoice.egpAmount', { amount: nf.format(row.total) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
