import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { attendanceRate, gradedCount, pickReport } from '@/features/term-reports/termReports';
import { TermReportView } from '@/features/term-reports/TermReportView';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentQuarterlyReports } from '@/hooks/useQuarterlyReports';
import { localName } from '@/lib/bilingualName';
import { formatDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';

/** The term reports the nursery sent; a notice opens one (?report=<id>), else the newest shows. */
export function ParentQuarterlyReportsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { user } = useAuthSession();
  const [params, setParams] = useSearchParams();
  const query = useParentQuarterlyReports(user?.id);
  const reports = query.data ?? [];
  const shown = pickReport(reports, params.get('report'));
  const rate = shown ? attendanceRate(shown.report.attendance_present, shown.report.attendance_total) : null;
  const graded = shown ? gradedCount(shown) : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <div className="no-print">
        <PageHeader icon="grading" title={t('reports.parentTitle')} description={t('reports.parentSubtitle')}>
          {reports.length ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile icon="description" label={t('termReports.stats.reports')} value={reports.length} />
              <StatTile icon="event" label={t('termReports.stats.latest')} value={reports[0].report.term_label} tone="neutral" />
              <StatTile icon="how_to_reg" label={t('reports.attendance')} value={rate != null ? `${rate}%` : '—'} tone={rate == null ? 'neutral' : rate >= 85 ? 'success' : 'warning'} />
              <StatTile icon="checklist" label={t('termReports.stats.graded')} value={graded ? t('termReports.of', { part: graded.graded, whole: graded.items }) : '—'} tone="primary" />
            </div>
          ) : null}
        </PageHeader>
      </div>

      {query.isError ? (
        <LoadError message={t('termReports.loadError')} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <TableCard title={t('reports.parentTitle')}>
          <TableLoading rows={4} />
        </TableCard>
      ) : !shown ? (
        <TableCard title={t('reports.parentTitle')}>
          <TableEmpty icon="grading" title={t('reports.parentEmptyTitle')} description={t('reports.parentEmptyDesc')} />
        </TableCard>
      ) : (
        <div className={cn('grid gap-4', reports.length > 1 && 'lg:grid-cols-[18rem_minmax(0,1fr)]')}>
          {reports.length > 1 ? (
            <nav aria-label={t('termReports.list')} className="no-print">
              <ul className="space-y-2">
                {reports.map((r) => {
                  const selected = r.report.id === shown.report.id;
                  return (
                    <li key={r.report.id}>
                      <button
                        type="button"
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => setParams({ report: r.report.id }, { replace: true })}
                        className={cn(
                          'w-full rounded-xl border p-3 text-start transition-colors',
                          selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant bg-surface hover:bg-surface-high',
                        )}
                        data-testid="term-report-pick"
                      >
                        <span className="block text-sm font-semibold text-on-surface">{r.report.term_label}</span>
                        <span className="block text-xs text-on-surface-variant">
                          {localName(r.report.childNameAr, r.report.childNameEn, isAr)}
                          {r.report.sent_at ? ` · ${formatDate(r.report.sent_at, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
          <TermReportView data={shown} />
        </div>
      )}
    </div>
  );
}
