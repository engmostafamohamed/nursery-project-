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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="h-16 animate-pulse rounded-2xl bg-surface-container" />
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
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined align-middle text-base text-success" aria-hidden>
          check_circle
        </span>{' '}
        {t('admin.dashboard.alerts.allClear')}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {visible.map((r) => (
        <Link
          key={r.key}
          to={r.to}
          className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning transition-colors hover:bg-warning/15"
        >
          <span className="material-symbols-outlined text-warning" aria-hidden>
            {r.icon}
          </span>
          <span className="font-medium">{t(`admin.dashboard.alerts.${r.key}`, { count: r.count })}</span>
        </Link>
      ))}
    </div>
  );
}
