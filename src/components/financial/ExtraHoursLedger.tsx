import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDate } from '@/lib/datetime';
import { summarizeExtraHours, type ExtraHoursDay, type ExtraHoursDayStatus } from '@/lib/familyFinance';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

type Props = {
  days: ExtraHoursDay[];
  isLoading?: boolean;
  /** Shows a child column when the history covers several children. */
  childName?: (childId: string) => string | null;
  /** Where an invoice number links to, e.g. "/parent/invoices". */
  invoiceLinkBase: string;
  className?: string;
};

const STATUS_VARIANT: Record<ExtraHoursDayStatus, 'success' | 'warning' | 'error' | 'outline' | 'secondary'> = {
  covered: 'success',
  no_charge: 'outline',
  paid: 'success',
  in_review: 'secondary',
  unpaid: 'error',
  not_invoiced: 'warning',
  cancelled: 'outline',
};

const PAGE = 15;

/** Late-pickup days with what each cost and whether it is paid, plus totals. */
export function ExtraHoursLedger({ days, isLoading = false, childName, invoiceLinkBase, className }: Props) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const summary = summarizeExtraHours(days);
  const visible = showAll ? days : days.slice(0, PAGE);

  const stats: Array<{ key: string; label: string; value: string; tone?: 'success' | 'error' | 'warning' }> = [
    { key: 'days', label: t('financial.extraHoursLedger.lateDays'), value: t('financial.extraHoursLedger.daysHours', { days: summary.days, hours: summary.hours }) },
    { key: 'covered', label: t('financial.extraHoursLedger.coveredByPackage'), value: t('financial.extraHoursLedger.hoursValue', { hours: summary.coveredHours }), tone: 'success' },
    { key: 'fees', label: t('financial.extraHoursLedger.fees'), value: money(summary.fees) },
    { key: 'paid', label: t('financial.extraHoursLedger.paid'), value: money(summary.paid), tone: 'success' },
    { key: 'unpaid', label: t('financial.extraHoursLedger.unpaid'), value: money(summary.unpaid), tone: summary.unpaid > 0 ? 'error' : undefined },
    ...(summary.notInvoiced > 0
      ? [{ key: 'notInvoiced', label: t('financial.extraHoursLedger.notInvoiced'), value: money(summary.notInvoiced), tone: 'warning' as const }]
      : []),
  ];

  return (
    <section className={cn('space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MaterialSymbol name="more_time" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-on-surface">{t('financial.extraHoursLedger.title')}</h2>
          <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{t('financial.extraHoursLedger.subtitle')}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : days.length === 0 ? (
        <p className="rounded-xl bg-surface-container px-3 py-4 text-sm text-on-surface-variant">{t('financial.extraHoursLedger.empty')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((stat) => (
              <div key={stat.key} className="rounded-xl bg-surface-container-lowest p-3 ring-1 ring-inset ring-outline-variant">
                <dt className="text-[11px] text-on-surface-variant">{stat.label}</dt>
                <dd
                  className={cn(
                    'mt-1 text-sm font-semibold tabular-nums text-on-surface',
                    stat.tone === 'success' && 'text-success',
                    stat.tone === 'error' && 'text-error',
                    stat.tone === 'warning' && 'text-warning',
                  )}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          {summary.notInvoiced > 0 ? (
            <p className="flex items-start gap-1.5 text-xs leading-5 text-warning">
              <MaterialSymbol name="info" size="text-sm" className="mt-0.5" />
              {t('financial.extraHoursLedger.notInvoicedNote')}
            </p>
          ) : null}

          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
            {visible.map((day) => (
              <li key={day.attendanceId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-on-surface">
                    {formatDate(day.date)}
                    {childName ? <span className="ms-2 text-xs font-normal text-on-surface-variant">{childName(day.childId) ?? ''}</span> : null}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {t('financial.extraHoursLedger.dayHours', { hours: day.hours })}
                    {day.coveredHours > 0 ? ` · ${t('financial.extraHoursLedger.dayCovered', { hours: day.coveredHours })}` : ''}
                    {day.invoiceId && day.invoiceNumber ? (
                      <>
                        {' · '}
                        <Link className="text-primary underline" to={`${invoiceLinkBase}/${day.invoiceId}`}>
                          {t('invoice.invoiceNumber', { number: day.invoiceNumber })}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold tabular-nums text-on-surface">{day.fee > 0 ? money(day.fee) : '—'}</span>
                  <Badge variant={STATUS_VARIANT[day.status]}>{t(`financial.extraHoursLedger.status.${day.status}`)}</Badge>
                </div>
              </li>
            ))}
          </ul>
          {days.length > PAGE ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>
              {showAll ? t('financial.extraHoursLedger.showLess') : t('financial.extraHoursLedger.showAll', { count: days.length })}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
