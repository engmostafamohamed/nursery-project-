import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, TableCard, TableEmpty, TableLoading, TBody, THead, Td, Th, Tr } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { StatTile } from '@/components/ui/StatTile';
import { useAdminLinks } from '@/hooks/useAdminBasePath';
import { useMoney } from '@/hooks/useMoney';
import { localName } from '@/lib/bilingualName';

import { discountErrorKey } from './discountLook';
import { PARTNER_KIND_ICON } from './discounts';
import { useDiscountReport } from './useDiscounts';

/** "Nov 2026" for a YYYY-MM month. */
function monthLabel(month: string, isArabic: boolean): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString(isArabic ? 'ar-EG' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * What the invoices issued between two days took off, and why: in all and by kind (partnerships,
 * the sibling discount, deals), each partner and deal with the families it reached, and month by month.
 */
export function DiscountsReport({ nurseryId, from, to }: { nurseryId: string | null | undefined; from: string; to: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const links = useAdminLinks();
  const report = useDiscountReport(nurseryId, from, to);
  const r = report.data;

  return (
    <TableCard title={t('discounts.report.title')} description={t('discounts.report.subtitle')}>
      {report.isError ? (
        <LoadError inset message={t(discountErrorKey(report.error))} onRetry={() => void report.refetch()} />
      ) : !r ? (
        <TableLoading rows={3} />
      ) : (
        <div className="space-y-5 p-4 sm:p-5" data-testid="discounts-report">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile icon="savings" label={t('discounts.report.total')} value={money(r.total)} helper={t('discounts.report.reach', { families: r.families, invoices: r.invoices })} />
            <StatTile icon="handshake" label={t('discounts.report.partnerships')} value={money(r.bySource.partnership)} tone="success" />
            <StatTile icon="diversity_1" label={t('discounts.report.sibling')} value={money(r.bySource.sibling)} tone="primary" />
            <StatTile icon="sell" label={t('discounts.report.deals')} value={money(r.bySource.deal + r.bySource.other)} tone="warning" />
          </div>

          {r.total === 0 ? (
            <TableEmpty icon="savings" title={t('discounts.report.empty')} />
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-outline-variant">
                <p className="border-b border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-surface">{t('discounts.report.byPartner')}</p>
                {r.byPartner.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-on-surface-variant">{t('discounts.report.noneInRange')}</p>
                ) : (
                  <DataTable minWidth={420}>
                    <THead>
                      <Th>{t('discounts.page.columns.partner')}</Th>
                      <Th align="end">{t('discounts.report.families')}</Th>
                      <Th align="end">{t('discounts.report.amount')}</Th>
                    </THead>
                    <TBody>
                      {r.byPartner.map((row) => (
                        <Tr key={row.partnerId}>
                          <Td>
                            <Link to={links.partnerPage(row.partnerId)} className="inline-flex items-center gap-2 font-medium text-on-surface hover:text-primary hover:underline">
                              <MaterialSymbol name={PARTNER_KIND_ICON[row.kind]} size="text-base" className="text-primary" />
                              {localName(row.nameAr, row.nameEn, isArabic) || '—'}
                            </Link>
                          </Td>
                          <Td align="end" className="tabular-nums">{row.families}</Td>
                          <Td align="end" className="tabular-nums font-semibold">{money(row.amount)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-outline-variant">
                <p className="border-b border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-surface">{t('discounts.report.byDeal')}</p>
                {r.byDeal.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-on-surface-variant">{t('discounts.report.noneInRange')}</p>
                ) : (
                  <DataTable minWidth={420}>
                    <THead>
                      <Th>{t('deals.columns.deal')}</Th>
                      <Th align="end">{t('discounts.report.families')}</Th>
                      <Th align="end">{t('discounts.report.amount')}</Th>
                    </THead>
                    <TBody>
                      {r.byDeal.map((row) => (
                        <Tr key={row.dealId}>
                          <Td className="font-medium">{localName(row.nameAr, row.nameEn, isArabic) || '—'}</Td>
                          <Td align="end" className="tabular-nums">{row.families}</Td>
                          <Td align="end" className="tabular-nums font-semibold">{money(row.amount)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </div>

              {r.byMonth.length > 1 ? (
                <div className="overflow-hidden rounded-xl border border-outline-variant xl:col-span-2">
                  <p className="border-b border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-surface">{t('discounts.report.byMonth')}</p>
                  <DataTable minWidth={560}>
                    <THead>
                      <Th>{t('discounts.report.month')}</Th>
                      <Th align="end">{t('discounts.report.partnerships')}</Th>
                      <Th align="end">{t('discounts.report.sibling')}</Th>
                      <Th align="end">{t('discounts.report.deals')}</Th>
                      <Th align="end">{t('discounts.report.total')}</Th>
                    </THead>
                    <TBody>
                      {r.byMonth.map((row) => (
                        <Tr key={row.month}>
                          <Td>{monthLabel(row.month, isArabic)}</Td>
                          <Td align="end" className="tabular-nums">{money(row.partnership)}</Td>
                          <Td align="end" className="tabular-nums">{money(row.sibling)}</Td>
                          <Td align="end" className="tabular-nums">{money(row.deal + row.other)}</Td>
                          <Td align="end" className="tabular-nums font-semibold">{money(row.partnership + row.sibling + row.deal + row.other)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </TableCard>
  );
}
