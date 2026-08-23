import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  useParentQuarterlyReports,
  type ParentQuarterlyReport,
} from '@/hooks/useQuarterlyReports';

function ReportCard({ data, isAr }: { data: ParentQuarterlyReport; isAr: boolean }) {
  const { t } = useTranslation();
  const { report, template, grades } = data;
  const childName = isAr
    ? report.childNameAr || report.childNameEn
    : report.childNameEn || report.childNameAr;

  return (
    <article className="overflow-hidden rounded-2xl border border-outline-variant bg-surface">
      <header className="border-b border-outline-variant px-5 py-4">
        <h2 className="text-lg font-bold text-on-surface">{childName}</h2>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-on-surface-variant">
          <span>{report.term_label}</span>
          {report.period_from && report.period_to ? (
            <span>
              {report.period_from} → {report.period_to}
            </span>
          ) : null}
          {report.attendance_present != null && report.attendance_total != null ? (
            <span>
              {t('reports.attendance')}: {report.attendance_present} / {report.attendance_total}
            </span>
          ) : null}
        </div>
      </header>

      <div className="space-y-3 p-4">
        {template.sections.map((s) => (
          <section key={s.id} className="overflow-hidden rounded-xl border border-outline-variant">
            <div className="bg-success/15 px-4 py-2 text-sm font-semibold text-on-surface">
              {isAr ? s.title_ar || s.title_en : s.title_en || s.title_ar}
            </div>
            <div className="divide-y divide-outline-variant">
              {s.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1 text-sm text-on-surface">
                    {isAr ? it.label_ar || it.label_en : it.label_en || it.label_ar}
                  </span>
                  <span className="w-8 rounded bg-primary/10 py-0.5 text-center text-sm font-bold text-primary">
                    {grades[it.id] ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        {report.comment ? (
          <section className="rounded-xl border border-outline-variant p-4">
            <h3 className="mb-1 text-sm font-semibold text-on-surface">{t('reports.comment')}</h3>
            <p className="whitespace-pre-line text-sm text-on-surface-variant">{report.comment}</p>
          </section>
        ) : null}

        {template.gradeLevels.length ? (
          <section className="rounded-xl border border-outline-variant p-4">
            <h3 className="mb-2 text-sm font-semibold text-on-surface">{t('reports.legend')}</h3>
            <ul className="grid grid-cols-2 gap-1 text-xs text-on-surface-variant sm:grid-cols-4">
              {template.gradeLevels.map((g) => (
                <li key={g.id}>
                  <span className="font-bold text-primary">{g.code}</span> ·{' '}
                  {isAr ? g.label_ar || g.label_en : g.label_en || g.label_ar}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}

export function ParentQuarterlyReportsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { user } = useAuthSession();
  const query = useParentQuarterlyReports(user?.id);

  return (
    <div className="mx-auto max-w-3xl lg:max-w-none space-y-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold text-on-surface">{t('reports.parentTitle')}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t('reports.parentSubtitle')}</p>
      </header>

      {query.isPending ? (
        <LoadingSkeleton />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          icon="grading"
          title={t('reports.parentEmptyTitle')}
          description={t('reports.parentEmptyDesc')}
        />
      ) : (
        <div className="space-y-5">
          {(query.data ?? []).map((d) => (
            <ReportCard key={d.report.id} data={d} isAr={isAr} />
          ))}
        </div>
      )}
    </div>
  );
}
