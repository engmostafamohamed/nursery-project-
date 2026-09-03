import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

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
    <div className="h-full rounded-3xl bg-surface-container-lowest p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-on-surface">{t('admin.dashboard.quickActions.title')}</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <li key={a.path}>
            <Link
              to={`${basePath}${a.path}`}
              className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface text-foreground p-4 transition-colors hover:border-primary hover:bg-primary-container/30"
            >
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-2xl text-primary" aria-hidden>
                {a.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-on-surface">{t(a.titleKey)}</span>
                <span className="mt-0.5 block text-xs text-on-surface-variant">{t(a.descKey)}</span>
              </span>
              <span className="material-symbols-outlined ms-auto shrink-0 text-on-surface-variant rtl:rotate-180" aria-hidden>
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
