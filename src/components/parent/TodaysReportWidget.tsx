import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { ParentReportItem } from '@/hooks/useParentReports';

type Props = {
  reports: ParentReportItem[];
  lastReportDate?: string | null;
  onOpen: (item: ParentReportItem) => void;
};

export function TodaysReportWidget({ reports, lastReportDate, onOpen }: Props) {
  const { t } = useTranslation();
  if (!reports.length) {
    return (
      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">{t('parent.reports.todayWidgetTitle')}</h2>
        <p className="mt-1 text-xs text-on-surface-variant">{t('parent.reports.noToday')}</p>
        {lastReportDate ? <p className="mt-1 text-xs text-on-surface-variant">{t('parent.reports.lastReportHint', { date: lastReportDate })}</p> : null}
      </section>
    );
  }
  return (
    <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-sm font-semibold text-on-surface">{t('parent.reports.todayWidgetTitle')}</h2>
      {reports.map((r) => (
        <article key={r.id} className="rounded-xl border border-outline-variant bg-surface text-foreground p-3">
          <p className="text-sm font-medium text-on-surface">{r.childName}</p>
          <p className="text-xs text-on-surface-variant">{String(r.mood.mood ?? '-')} - {t('parent.reports.nap.duration')}: {Number(r.nap.duration_minutes ?? 0)} {t('parent.reports.minutes')}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => onOpen(r)}>
            {t('parent.reports.viewFull')}
          </Button>
        </article>
      ))}
    </section>
  );
}
