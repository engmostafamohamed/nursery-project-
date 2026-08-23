import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import type { AdminDashboardCharts } from '@/hooks/useAdminDashboardCharts';

type Props = {
  data: AdminDashboardCharts | undefined;
  isLoading: boolean;
};

function formatShortDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
  }).format(d);
}

export function DashboardMiniCharts({ data, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (isLoading || !data) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-56 w-full rounded-3xl" />
      </div>
    );
  }

  const maxAtt = Math.max(1, ...data.attendance7.map((p) => p.ratePercent));
  const maxRev = Math.max(1, ...data.revenue30.map((p) => p.amount));
  const maxEnroll = Math.max(1, ...data.enrollmentByClass.map((p) => p.count));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-on-surface">
          <span className="material-symbols-outlined text-primary" aria-hidden>
            bar_chart
          </span>
          {t('admin.dashboard.charts.attendanceTitle')}
        </h3>
        <div className="flex h-40 items-end justify-between gap-1 border-b border-outline-variant pb-1">
          {data.attendance7.map((p) => (
            <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full max-w-[2rem] rounded-t-md bg-primary transition-all"
                style={{ height: `${(p.ratePercent / maxAtt) * 100}%`, minHeight: p.ratePercent > 0 ? 4 : 0 }}
                title={`${p.ratePercent}%`}
              />
              <span className="text-[10px] text-on-surface-variant">{formatShortDate(p.date, locale)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">{t('admin.dashboard.charts.attendanceHint')}</p>
      </div>

      <div className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-on-surface">
          <span className="material-symbols-outlined text-primary" aria-hidden>
            trending_up
          </span>
          {t('admin.dashboard.charts.revenueTitle')}
        </h3>
        <div className="relative h-40">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              className="text-primary"
              vectorEffect="non-scaling-stroke"
              points={data.revenue30
                .map((p, i) => {
                  const x = data.revenue30.length > 1 ? (i / (data.revenue30.length - 1)) * 100 : 50;
                  const y = 40 - (p.amount / maxRev) * 36 - 2;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
          </svg>
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">{t('admin.dashboard.charts.revenueHint')}</p>
      </div>

      <div className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-on-surface">
          <span className="material-symbols-outlined text-primary" aria-hidden>
            pie_chart
          </span>
          {t('admin.dashboard.charts.enrollmentTitle')}
        </h3>
        <ul className="space-y-2">
          {data.enrollmentByClass.slice(0, 6).map((row) => {
            const label = locale === 'ar' ? row.labelAr : row.labelEn;
            const w = (row.count / maxEnroll) * 100;
            return (
              <li key={row.classId}>
                <div className="mb-0.5 flex justify-between text-xs text-on-surface">
                  <span className="truncate pe-2">{label}</span>
                  <span className="shrink-0 font-medium">{row.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${w}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        {data.enrollmentByClass.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('admin.dashboard.charts.enrollmentEmpty')}</p>
        ) : null}
      </div>
    </div>
  );
}
