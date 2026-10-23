import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const ACTIONS = [
  { to: '/parent/daily-reports', icon: 'description', titleKey: 'parent.dashboard.quick.reports', descKey: 'parent.dashboard.quick.reportsDesc' },
  { to: '/parent/qr-code', icon: 'qr_code_2', titleKey: 'parent.dashboard.quick.qr', descKey: 'parent.dashboard.quick.qrDesc' },
  { to: '/parent/media', icon: 'photo_library', titleKey: 'parent.dashboard.quick.media', descKey: 'parent.dashboard.quick.mediaDesc' },
  { to: '/parent/invoices', icon: 'receipt_long', titleKey: 'parent.dashboard.quick.pay', descKey: 'parent.dashboard.quick.payDesc' },
  { to: '/parent/permissions', icon: 'rule', titleKey: 'parent.dashboard.quick.permissions', descKey: 'parent.dashboard.quick.permissionsDesc' },
] as const;

export function ParentDashboardQuickActions() {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-3 shadow-sm sm:p-4">
      {/* One column beside the schedule on wide screens, two on tablets. */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {ACTIONS.map((a) => (
          <li key={a.to}>
            <Link
              to={a.to}
              className="group flex h-full items-center gap-3 rounded-lg border border-outline-variant bg-surface px-3 py-2.5 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
                <span className="material-symbols-outlined text-xl">{a.icon}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-on-surface">{t(a.titleKey)}</span>
                <span className="block truncate text-xs text-on-surface-variant">{t(a.descKey)}</span>
              </span>
              <span className="material-symbols-outlined shrink-0 text-on-surface-variant transition group-hover:text-primary rtl:rotate-180" aria-hidden>
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
