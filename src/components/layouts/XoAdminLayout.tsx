import { useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AdminNurseryPicker } from '@/components/admin/AdminNurseryPicker';
import { AdminUserMenu } from '@/components/admin/AdminUserMenu';
import { HelpAiBundle } from '@/components/help/HelpAiBundle';
import { BackButton } from '@/components/shared/BackButton';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { PWAInstallPrompt } from '@/components/shared/PWAInstallPrompt';
import { Button } from '@/components/ui/button';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNotificationsCenter } from '@/hooks/useNotificationsCenter';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn, getUserInitials } from '@/lib/utils';
import { NotificationCenterDrawer } from '@/components/notifications/NotificationCenterDrawer';
import { ReminderAlertHost } from '@/components/notifications/ReminderAlertHost';

type NavItem = { key: string; to: string; icon: string; tKey: string };
type NavSection = { key: string; labelKey: string; items: NavItem[] };

const PLATFORM_ITEMS: NavItem[] = [
  { key: 'dashboard',  to: '/xo-admin',            icon: 'space_dashboard',     tKey: 'xoAdmin.nav.dashboard' },
  { key: 'nurseries',  to: '/xo-admin/nurseries',  icon: 'apartment',           tKey: 'xoAdmin.nav.nurseries' },
  { key: 'analytics',  to: '/xo-admin/analytics',  icon: 'stacked_line_chart',  tKey: 'xoAdmin.nav.analytics' },
  { key: 'payments',   to: '/xo-admin/payments',   icon: 'payments',            tKey: 'xoAdmin.nav.payments' },
  { key: 'settings',   to: '/xo-admin/settings',   icon: 'settings',            tKey: 'xoAdmin.nav.settings' },
];

const NAV_SECTIONS: NavSection[] = [
  {
    key: 'platform',
    labelKey: 'xoAdmin.nav.sections.platform',
    items: PLATFORM_ITEMS,
  },
  {
    key: 'nurseryManagement',
    labelKey: 'xoAdmin.nav.sections.nurseryManagement',
    items: [
      { key: 'children',           to: '/xo-admin/nursery/children',              icon: 'group',                  tKey: 'admin.nav.children' },
      { key: 'staff',              to: '/xo-admin/nursery/staff',                 icon: 'badge',                  tKey: 'admin.nav.staff' },
      { key: 'classes',            to: '/xo-admin/nursery/classes',               icon: 'school',                 tKey: 'admin.nav.classes' },
      { key: 'admissions',         to: '/xo-admin/nursery/admissions/inquiries',  icon: 'group_add',              tKey: 'admin.nav.admissions' },
      { key: 'childEnrollment',    to: '/xo-admin/nursery/children/enroll',       icon: 'child_care',             tKey: 'admin.nav.childEnrollment' },
      { key: 'staffOnboarding',    to: '/xo-admin/nursery/staff/onboarding',      icon: 'assignment_ind',         tKey: 'admin.nav.staffOnboarding' },
      { key: 'admissionsImport',   to: '/xo-admin/nursery/admissions/import',     icon: 'upload_file',            tKey: 'admin.nav.admissionsImport' },
    ],
  },
  {
    key: 'dailyOperations',
    labelKey: 'xoAdmin.nav.sections.dailyOperations',
    items: [
      { key: 'attendance',         to: '/xo-admin/nursery/attendance',            icon: 'how_to_reg',             tKey: 'admin.nav.attendance' },
      { key: 'events',             to: '/xo-admin/nursery/events',                icon: 'event',                  tKey: 'admin.nav.events' },
      { key: 'courses',            to: '/xo-admin/nursery/courses',               icon: 'school',                 tKey: 'admin.nav.courses' },
      { key: 'packages',           to: '/xo-admin/nursery/packages',              icon: 'package_2',              tKey: 'admin.nav.packages' },
      { key: 'inventory',          to: '/xo-admin/nursery/inventory',             icon: 'inventory_2',            tKey: 'admin.nav.inventory' },
      { key: 'meals',              to: '/xo-admin/nursery/meals',                 icon: 'restaurant',             tKey: 'admin.nav.meals' },
      { key: 'qrCodes',            to: '/xo-admin/nursery/qr-codes',              icon: 'qr_code_2',              tKey: 'admin.nav.qrCodes' },
      { key: 'healthAlerts',       to: '/xo-admin/nursery/health/alerts',         icon: 'medical_services',       tKey: 'admin.nav.healthAlerts' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'xoAdmin.nav.sections.finance',
    items: [
      { key: 'financial',          to: '/xo-admin/nursery/financial/dashboard',   icon: 'account_balance',        tKey: 'admin.nav.financialDashboard' },
      { key: 'invoices',           to: '/xo-admin/nursery/invoices',              icon: 'receipt_long',           tKey: 'admin.nav.invoices' },
      { key: 'payroll',            to: '/xo-admin/nursery/staff/payroll',         icon: 'payments',               tKey: 'admin.nav.payroll' },
      { key: 'reportsFinancial',   to: '/xo-admin/nursery/reports/financial',     icon: 'monitoring',             tKey: 'admin.nav.reportsFinancial' },
      { key: 'reports',            to: '/xo-admin/nursery/reports',               icon: 'grading',                tKey: 'admin.nav.reports' },
    ],
  },
  {
    key: 'content',
    labelKey: 'xoAdmin.nav.sections.content',
    items: [
      { key: 'surveys',            to: '/xo-admin/nursery/surveys',               icon: 'fact_check',             tKey: 'admin.nav.surveys' },
      { key: 'mediaLibrary',       to: '/xo-admin/nursery/media',                 icon: 'photo_library',          tKey: 'admin.nav.mediaLibrary' },
      { key: 'mediaUpload',        to: '/xo-admin/nursery/media/upload',          icon: 'add_photo_alternate',    tKey: 'admin.nav.mediaUpload' },
      { key: 'mediaApproval',      to: '/xo-admin/nursery/media/approval',        icon: 'fact_check',             tKey: 'admin.nav.mediaApproval' },
      { key: 'library',            to: '/xo-admin/nursery/library',               icon: 'menu_book',              tKey: 'admin.nav.library' },
      { key: 'loyalty',            to: '/xo-admin/nursery/loyalty',               icon: 'workspace_premium',      tKey: 'admin.nav.loyalty' },
    ],
  },
  {
    key: 'communication',
    labelKey: 'xoAdmin.nav.sections.communication',
    items: [
      { key: 'broadcastComposer',  to: '/xo-admin/nursery/messages/broadcast',    icon: 'campaign',               tKey: 'admin.nav.broadcastComposer' },
      { key: 'broadcastHistory',   to: '/xo-admin/nursery/messages/broadcasts',   icon: 'history',                tKey: 'admin.nav.broadcastHistory' },
      { key: 'chat',               to: '/xo-admin/nursery/chat',                  icon: 'forum',                  tKey: 'admin.nav.chat' },
      { key: 'reminders',          to: '/xo-admin/nursery/reminders',             icon: 'alarm',                  tKey: 'admin.nav.reminders' },
    ],
  },
  {
    key: 'access',
    labelKey: 'xoAdmin.nav.sections.access',
    items: [
      { key: 'rbacPositions',      to: '/xo-admin/nursery/settings/positions',    icon: 'work',                   tKey: 'admin.nav.rbacPositions' },
      { key: 'rbacRoles',          to: '/xo-admin/nursery/settings/roles',        icon: 'shield_person',          tKey: 'admin.nav.rbacRoles' },
      { key: 'rbacFeatures',       to: '/xo-admin/nursery/settings/features',     icon: 'extension',              tKey: 'admin.nav.rbacFeatures' },
    ],
  },
];

export function XoAdminLayout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const { data: notifications = [] } = useNotificationsCenter(user?.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  const displayName =
    i18n.language === 'ar'
      ? (profile?.name_ar?.trim() || profile?.name_en?.trim() || '')
      : (profile?.name_en?.trim() || profile?.name_ar?.trim() || '');
  const accountEmail = profile?.email ?? user?.email ?? '';
  const initials = getUserInitials(displayName, accountEmail);
  const isNurseryFeatureRoute =
    location.pathname === '/xo-admin/nursery' || location.pathname.startsWith('/xo-admin/nursery/');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OfflineIndicator />

      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 start-0 z-40 hidden w-64 flex-col bg-surface lg:flex">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Link to="/xo-admin" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              XO
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">XO Platform</p>
              <p className="text-xs text-foreground-secondary">{t('xoAdmin.nav.superAdmin')}</p>
            </div>
          </Link>
        </div>
        <nav
          className="mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-4"
          aria-label={t('xoAdmin.nav.sidebarLabel')}
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-1">
              <p
                className={cn(
                  'px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70',
                  section.key === 'platform' ? 'pt-1' : 'pt-4',
                )}
              >
                {t(section.labelKey)}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === '/xo-admin'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-surface-low hover:text-foreground',
                    )
                  }
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>
                    {item.icon}
                  </span>
                  <span>{t(item.tKey)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 text-xs text-muted-foreground">
          <p className="font-medium">{displayName || t('admin.userMenu.fallbackName')}</p>
          <p className="truncate">{accountEmail || '—'}</p>
        </div>
      </aside>

      {/* Mobile top nav */}
      <header className="no-print sticky top-0 z-30 glass lg:ms-64">
        <div className="flex items-center gap-3 px-6 py-4">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-ghost bg-surface text-foreground lg:hidden"
            aria-label={t('common.openMenu')}
            onClick={() => setMobileNavOpen(true)}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>
              menu
            </span>
          </button>

          <BackButton />

          <div className="hidden flex-col lg:flex">
            <p className="text-xs font-medium text-muted-foreground">XO Platform</p>
            <p className="text-sm font-semibold text-foreground">
              {location.pathname === '/xo-admin'
                ? t('xoAdmin.nav.dashboard')
                : t('xoAdmin.nav.superAdmin')}
            </p>
          </div>

          <div className="flex-1" />

          <div className="relative hidden max-w-md flex-1 items-center lg:flex">
            <span className="material-symbols-outlined pointer-events-none absolute start-3 top-2.5 text-muted-foreground">
              search
            </span>
            <input
              className="h-10 w-full rounded-full bg-surface-low px-10 text-xs text-foreground outline-none placeholder:text-foreground-tertiary no-border border-ghost"
              placeholder={t('xoAdmin.searchPlaceholder')}
              aria-label={t('xoAdmin.searchAria')}
            />
          </div>

          <ThemeSwitcher />

          <LanguageToggle />

          <Button
            variant="outline"
            size="icon"
            aria-label={t('admin.notifications.drawerAria')}
            className="relative"
            onClick={() => setDrawerOpen(true)}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>
              notifications
            </span>
            {unreadCount > 0 ? (
              <span className="absolute -end-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-white">
                {unreadCount}
              </span>
            ) : null}
          </Button>

          <AdminUserMenu />
        </div>
      </header>

      {/* Mobile sidebar drawer */}
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label={t('common.closeMenu')}
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-64 transform bg-surface p-5 shadow-ambient transition-transform lg:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold">
              XO
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">XO Platform</p>
              <p className="text-xs text-muted-foreground">{t('xoAdmin.nav.superAdmin')}</p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-ghost text-foreground"
            onClick={() => setMobileNavOpen(false)}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden>
              close
            </span>
          </button>
        </div>
        <nav className="mt-2 max-h-[calc(100vh-180px)] space-y-1 overflow-y-auto pb-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-1">
              <p
                className={cn(
                  'px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground-secondary/70',
                  section.key === 'platform' ? 'pt-1' : 'pt-4',
                )}
              >
                {t(section.labelKey)}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === '/xo-admin'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground-secondary hover:bg-surface-low hover:text-foreground',
                    )
                  }
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>
                    {item.icon}
                  </span>
                  <span>{t(item.tKey)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-4 border-t border-border pt-3 text-xs text-foreground-secondary">
          <p className="font-medium">{displayName || t('admin.userMenu.fallbackName')}</p>
          <p className="truncate">{accountEmail || '—'}</p>
          <p className="mt-1 text-[11px]">
            {t('xoAdmin.nav.initialsLabel', { initials })}
          </p>
        </div>
      </aside>

      <div className="lg:ms-64">
        <main className="px-4 py-4 lg:px-8 lg:py-6">
          <PWAInstallPrompt />
          {isNurseryFeatureRoute ? (
            <section className="mb-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    {t('admin.nurseryPicker.label')}
                  </p>
                  <p className="mt-1 text-sm font-medium text-on-surface">
                    {t('xoAdmin.nav.nurseries')}
                  </p>
                </div>
                <div className="w-full lg:max-w-sm">
                  <AdminNurseryPicker />
                </div>
              </div>
            </section>
          ) : null}
          <Outlet />
        </main>
      </div>

      <NotificationCenterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        userId={user?.id}
        role="admin"
      />
      <ReminderAlertHost />
      <HelpAiBundle layoutRole="admin" />
      <ChatWidget
        role="admin"
        currentUserId={user?.id}
        nurseryId={profile?.nursery_id ?? null}
        languagePref={languagePref}
      />
    </div>
  );
}

