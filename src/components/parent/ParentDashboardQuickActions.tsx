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
    <section className="max-h-[280px] overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm lg:max-h-[360px]">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {ACTIONS.map((a) => (
          <li key={a.to}>
            <Link
              to={a.to}
              className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface px-4 py-3 text-foreground transition-colors hover:border-primary hover:bg-primary-container/20"
            >
              <span className="material-symbols-outlined shrink-0 text-2xl text-primary" aria-hidden>
                {a.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-on-surface">{t(a.titleKey)}</span>
                <span className="block text-xs text-on-surface-variant">{t(a.descKey)}</span>
              </span>
              <span className="material-symbols-outlined shrink-0 text-on-surface-variant rtl:rotate-180" aria-hidden>
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
