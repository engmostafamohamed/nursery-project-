import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { AdminDashboardAlerts } from '@/hooks/useAdminDashboardAlerts';

type Props = {
  alerts: AdminDashboardAlerts | undefined;
  isLoading: boolean;
  basePath?: string;
};

export function DashboardAlertsBar({ alerts, isLoading, basePath = '/admin' }: Props) {
  const { t } = useTranslation();

  if (isLoading || !alerts) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="h-16 animate-pulse rounded-xl bg-surface-container" />
        ))}
      </div>
    );
  }

  const rows: { key: string; count: number; to: string; icon: string }[] = [
    {
      key: 'overdue',
      count: alerts.overdueInvoices,
      to: `${basePath}/invoices`,
      icon: 'warning',
    },
    {
      key: 'docs',
      count: alerts.applicationsNeedingDocs,
      to: `${basePath}/admissions/applications`,
      icon: 'description',
    },
    {
      key: 'staff',
      count: alerts.teachersNotCheckedIn,
      to: `${basePath}/staff`,
      icon: 'badge',
    },
    {
      key: 'events',
      count: alerts.upcomingEventsSoon,
      to: `${basePath}/calendar`,
      icon: 'event',
    },
  ];

  const visible = rows.filter((r) => r.count > 0);

  if (!visible.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-on-surface">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success/10 text-success" aria-hidden>
          <span className="material-symbols-outlined text-xl">task_alt</span>
        </span>
        {t('admin.dashboard.alerts.allClear')}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {visible.map((r) => (
        <Link
          key={r.key}
          to={r.to}
          className="group flex items-center gap-3 rounded-xl border border-warning/30 bg-surface px-4 py-3 text-sm shadow-sm transition hover:border-warning/60 hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning" aria-hidden>
            <span className="material-symbols-outlined text-xl">{r.icon}</span>
          </span>
          <span className="min-w-0 flex-1 font-semibold text-on-surface">{t(`admin.dashboard.alerts.${r.key}`, { count: r.count })}</span>
          <span className="material-symbols-outlined shrink-0 text-on-surface-variant transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden>
            chevron_right
          </span>
        </Link>
      ))}
    </div>
  );
}
