import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ParentQuarterlyReport } from '@/hooks/useQuarterlyReports';
import { localName } from '@/lib/bilingualName';
import { formatDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { attendanceRate } from './termReports';

/** One term report as the family reads (and prints) it: who, which term, attendance, each section's grades, the comment. */
export function TermReportView({ data }: { data: ParentQuarterlyReport }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { report, template, grades } = data;
  const rate = attendanceRate(report.attendance_present, report.attendance_total);
  const levelOf = new Map(template.gradeLevels.map((g) => [g.code, localName(g.label_ar, g.label_en, isAr)]));

  return (
    <article className="invoice-print-area overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm" data-testid="term-report">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-primary">{report.term_label}</p>
          <h2 className="text-xl font-bold text-on-surface">{localName(report.childNameAr, report.childNameEn, isAr)}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {report.period_from && report.period_to
              ? t('termReports.period', {
                  from: formatDate(report.period_from, { day: 'numeric', month: 'short' }),
                  to: formatDate(report.period_to, { day: 'numeric', month: 'short', year: 'numeric' }),
                })
              : null}
            {report.sent_at ? <span className="ms-2">· {t('termReports.sentOn', { date: formatDate(report.sent_at, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span> : null}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
          <MaterialSymbol name="print" size="text-base" className="me-1" />
          {t('termReports.print')}
        </Button>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {rate != null ? (
          <section className="rounded-xl border border-outline-variant p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-on-surface">{t('reports.attendance')}</span>
              <span className="tabular-nums text-on-surface-variant">
                {t('termReports.attendanceDays', { present: report.attendance_present, total: report.attendance_total })} ·{' '}
                <strong className="text-on-surface">{rate}%</strong>
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-high" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn('h-full rounded-full', rate >= 85 ? 'bg-success' : rate >= 70 ? 'bg-warning' : 'bg-error')} style={{ width: `${rate}%` }} />
            </div>
          </section>
        ) : null}

        {template.gradeLevels.length ? (
          <section aria-label={t('reports.legend')} className="flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="font-semibold text-on-surface">{t('reports.legend')}:</span>
            {template.gradeLevels.map((g) => (
              <span key={g.id} className="rounded-full bg-surface-high px-2 py-0.5">
                <strong className="text-primary">{g.code}</strong> {localName(g.label_ar, g.label_en, isAr)}
              </span>
            ))}
          </section>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {template.sections.map((s) => (
            <section key={s.id} className="overflow-hidden rounded-xl border border-outline-variant">
              <h3 className="bg-success/10 px-4 py-2 text-sm font-semibold text-on-surface">{localName(s.title_ar, s.title_en, isAr)}</h3>
              <ul className="divide-y divide-outline-variant">
                {s.items.map((it) => {
                  const grade = grades[it.id];
                  return (
                    <li key={it.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="flex-1 text-sm text-on-surface">{localName(it.label_ar, it.label_en, isAr)}</span>
                      <span
                        className={cn('min-w-9 rounded-md px-1.5 py-0.5 text-center text-sm font-bold', grade ? 'bg-primary/10 text-primary' : 'text-on-surface-variant')}
                        title={grade ? levelOf.get(grade) : undefined}
                      >
                        {grade ?? '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {report.comment ? (
          <section className="flex gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <MaterialSymbol name="format_quote" className="text-primary" />
            <div>
              <h3 className="mb-1 text-sm font-semibold text-on-surface">{t('reports.comment')}</h3>
              <p className="whitespace-pre-line text-sm text-on-surface-variant">{report.comment}</p>
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
