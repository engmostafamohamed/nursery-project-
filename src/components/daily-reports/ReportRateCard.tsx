import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { CompletionBar } from '@/components/daily-reports/CompletionBar';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useDailyReportStats } from '@/hooks/useDailyReportWorkflow';
import { pick, rateTone } from '@/lib/dailyReportStats';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';

const TEXT_TONE = { primary: 'text-primary', success: 'text-success', warning: 'text-warning', error: 'text-error', neutral: 'text-on-surface-variant' } as const;
const SHOWN_CLASSES = 4;

/**
 * Today's daily report send rate across the nursery, with the classes furthest behind: for the
 * admin's dashboard and the head of teachers'. Links to the full page with every filter.
 */
export function ReportRateCard({ nurseryId, to, className }: { nurseryId: string | null | undefined; to: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [today] = useState(() => getNurseryCalendarDateString());
  const query = useDailyReportStats(nurseryId, { from: today, to: today });
  const totals = query.data?.totals;
  const behind = [...(query.data?.by_class ?? [])]
    .filter((c) => c.expected > 0)
    .sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100))
    .slice(0, SHOWN_CLASSES);
  const tone = rateTone(totals?.rate);

  if (query.isError) return null;

  return (
    <section className={cn('flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5', className)}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
            <MaterialSymbol name="assignment_turned_in" className="text-primary" />
            {t('dailyReport.card.title')}
          </h2>
          <p className="text-xs text-on-surface-variant">{t('dailyReport.card.subtitle')}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to={to}>
            {t('dailyReport.card.all')}
            <MaterialSymbol name="chevron_right" className="ms-1 text-lg rtl:rotate-180" />
          </Link>
        </Button>
      </header>
      {query.isPending || !totals ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : totals.expected === 0 ? (
        <p className="text-sm text-on-surface-variant">{t('dailyReport.card.nothing')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <p className={cn('font-headline text-4xl font-extrabold tabular-nums', TEXT_TONE[tone])}>{t('dailyReport.percent', { value: totals.rate ?? 0 })}</p>
            <p className="pb-1 text-sm text-on-surface-variant">
              {t('dailyReport.card.sentOf', { sent: totals.sent, expected: totals.expected })}
              {totals.missing ? ` · ${t('dailyReport.card.missing', { count: totals.missing })}` : ''}
            </p>
          </div>
          {behind.length ? (
            <ul className="space-y-2">
              {behind.map((c) => (
                <li key={c.class_id} className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)] items-center gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-on-surface">{pick(c.name_ar, c.name_en, lang)}</span>
                    <span className="block truncate text-xs text-on-surface-variant">{pick(c.lead_ar, c.lead_en, lang)}</span>
                  </span>
                  <CompletionBar percent={c.rate} tone={rateTone(c.rate)} label={t('dailyReport.rates.rateOf', { name: pick(c.name_ar, c.name_en, lang) })} detail={`${c.sent}/${c.expected}`} />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
