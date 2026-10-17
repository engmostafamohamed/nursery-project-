import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Card, CardContent } from '@/components/ui/card';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

type Props = {
  extraHours: { invoiceCount: number; billed: number; paid: number; outstanding: number; unpaidCount: number };
  nf: Intl.NumberFormat;
  /** Invoices list path, e.g. "/admin/invoices". */
  invoicesPath: string;
};

/** Late-pickup (extra hours) charges across the nursery: billed, paid, and still owed. */
export function FinancialDashboardExtraHours({ extraHours, nf, invoicesPath }: Props) {
  const { t } = useTranslation();
  const money = (amount: number) => t('invoice.egpAmount', { amount: nf.format(amount) });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MaterialSymbol name="more_time" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-on-surface">{t('financial.extraHoursLedger.dashboardTitle')}</h2>
              <p className="text-xs text-on-surface-variant">
                {t('financial.extraHoursLedger.dashboardHint', { count: extraHours.invoiceCount })}
              </p>
            </div>
          </div>
          <Link className="text-xs font-semibold text-primary underline" to={`${invoicesPath}?type=extra_hours`}>
            {t('financial.extraHoursLedger.viewInvoices')}
          </Link>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl bg-surface-container-lowest p-3 ring-1 ring-inset ring-outline-variant">
            <dt className="text-xs text-on-surface-variant">{t('financial.extraHoursLedger.billed')}</dt>
            <dd className="mt-1 font-bold tabular-nums text-on-surface">{money(extraHours.billed)}</dd>
          </div>
          <div className="rounded-xl bg-surface-container-lowest p-3 ring-1 ring-inset ring-outline-variant">
            <dt className="text-xs text-on-surface-variant">{t('financial.extraHoursLedger.paid')}</dt>
            <dd className="mt-1 font-bold tabular-nums text-success">{money(extraHours.paid)}</dd>
          </div>
          <div className="rounded-xl bg-surface-container-lowest p-3 ring-1 ring-inset ring-outline-variant">
            <dt className="text-xs text-on-surface-variant">{t('financial.extraHoursLedger.unpaid')}</dt>
            <dd className={`mt-1 font-bold tabular-nums ${extraHours.outstanding > 0 ? 'text-error' : 'text-on-surface'}`}>
              {money(extraHours.outstanding)}
            </dd>
            {extraHours.unpaidCount > 0 ? (
              <p className="text-[11px] text-on-surface-variant">
                {t('financial.extraHoursLedger.unpaidInvoices', { count: extraHours.unpaidCount })}
              </p>
            ) : null}
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
