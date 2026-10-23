import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { TableCard } from '@/components/ui/DataTable';

type ActionItem = {
  path: string;
  icon: string;
  titleKey: string;
  descKey: string;
};

const ACTIONS: ActionItem[] = [
  {
    path: '/events/create',
    icon: 'event',
    titleKey: 'admin.dashboard.quickActions.event',
    descKey: 'admin.dashboard.quickActions.eventDesc',
  },
  {
    path: '/messages/broadcast',
    icon: 'campaign',
    titleKey: 'admin.dashboard.quickActions.broadcast',
    descKey: 'admin.dashboard.quickActions.broadcastDesc',
  },
  {
    path: '/media/approval',
    icon: 'fact_check',
    titleKey: 'admin.dashboard.quickActions.media',
    descKey: 'admin.dashboard.quickActions.mediaDesc',
  },
  {
    path: '/children/enroll',
    icon: 'person_add',
    titleKey: 'admin.dashboard.quickActions.child',
    descKey: 'admin.dashboard.quickActions.childDesc',
  },
  {
    path: '/reports/financial',
    icon: 'monitoring',
    titleKey: 'admin.dashboard.quickActions.report',
    descKey: 'admin.dashboard.quickActions.reportDesc',
  },
];

type Props = {
  basePath?: string;
};

export function DashboardQuickActions({ basePath = '/admin' }: Props) {
  const { t } = useTranslation();

  return (
    <TableCard title={t('admin.dashboard.quickActions.title')} className="h-full">
      {/* One column beside the activity feed on wide screens, two on tablets. */}
      <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-1">
        {ACTIONS.map((a) => (
          <li key={a.path}>
            <Link
              to={`${basePath}${a.path}`}
              className="group flex h-full items-center gap-3 rounded-xl border border-outline-variant bg-surface p-3 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
                <span className="material-symbols-outlined text-xl">{a.icon}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-on-surface">{t(a.titleKey)}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-on-surface-variant">{t(a.descKey)}</span>
              </span>
              <span className="material-symbols-outlined shrink-0 text-on-surface-variant transition group-hover:text-primary rtl:rotate-180" aria-hidden>
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TableCard>
  );
}
