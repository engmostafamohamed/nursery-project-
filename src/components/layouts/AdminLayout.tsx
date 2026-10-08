import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AdminUserMenu } from '@/components/admin/AdminUserMenu';
import { HelpAiBundle } from '@/components/help/HelpAiBundle';
import { NotificationCenterDrawer } from '@/components/notifications/NotificationCenterDrawer';
import { ReminderAlertHost } from '@/components/notifications/ReminderAlertHost';
import { BackButton } from '@/components/shared/BackButton';
import { FeatureRouteGuard } from '@/components/shared/FeatureRouteGuard';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { PWAInstallPrompt } from '@/components/shared/PWAInstallPrompt';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useAdminInAppNotifications } from '@/hooks/useAdminInAppNotifications';
import { useNotificationsCenter } from '@/hooks/useNotificationsCenter';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useAllowedFeatures, useCurrentSubject } from '@/hooks/usePermissions';
import { type FeatureKey } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { isHelpPanelEnabled } from '@/lib/helpAiPreferences';
import { cn, getUserInitials } from '@/lib/utils';
import { useHelpAiUiStore } from '@/store/useHelpAiUiStore';

/**
 * Admin chrome: sidebar uses logical start/end spacing — Wave 6 RTL review (icons + nav).
 * Routes below must match exactly so child paths (e.g. /staff/onboarding) don’t highlight the parent link.
 */
const SIDEBAR_COLLAPSED_KEY = 'xo-admin-sidebar-collapsed';

function readStoredSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const NAV_LINK_END_PATHS = new Set([
  '/admin',
  '/admin/children',
  '/admin/staff',
  '/admin/media',
  '/admin/staff/payroll',
  '/admin/attendance',
  '/admin/attendance/dashboard',
  '/admin/attendance/logs',
  '/admin/scanner',
  '/admin/health/alerts',
  '/admin/messages/broadcast',
  '/admin/events',
  '/admin/courses',
]);

/**
 * Each nav item may carry a `feature` from the permission matrix.
 * Items without a `feature` are always visible (personal screens such as reminders).
 * The sidebar filters these against the current user so a Finance/HR manager only
 * sees what their department unlocks.
 */
type NavItem = { to: string; key: string; icon: string; feature?: FeatureKey; xoOnly?: boolean };

const navItems: NavItem[] = [
  { to: '/admin', key: 'dashboard', icon: 'space_dashboard', feature: 'dashboard_attendance' },
  { to: '/admin/children', key: 'children', icon: 'group', feature: 'kids_applications' },
  { to: '/admin/staff', key: 'staff', icon: 'badge', feature: 'staff' },
  { to: '/admin/classes', key: 'classes', icon: 'school', feature: 'classes' },
  { to: '/admin/admissions/applications', key: 'admissions', icon: 'group_add', feature: 'admissions' },
  { to: '/admin/attendance', key: 'attendance', icon: 'how_to_reg', feature: 'dashboard_attendance' },
  { to: '/admin/scanner', key: 'scanner', icon: 'qr_code_scanner', feature: 'qr_scanner' },
  { to: '/admin/events', key: 'events', icon: 'event', feature: 'event_calendar' },
  { to: '/admin/courses', key: 'courses', icon: 'school', feature: 'courses' },
  { to: '/admin/packages', key: 'packages', icon: 'package_2', feature: 'packages' },
  { to: '/admin/deals', key: 'deals', icon: 'sell', feature: 'deals' },
  { to: '/admin/reports', key: 'reports', icon: 'grading', feature: 'daily_reports' },
  { to: '/admin/chat', key: 'chat', icon: 'forum', feature: 'chat' },
  { to: '/admin/messages/broadcast', key: 'broadcastComposer', icon: 'campaign', feature: 'broadcast_messages' },
  { to: '/admin/surveys', key: 'surveys', icon: 'fact_check', feature: 'surveys' },
  { to: '/admin/financial/dashboard', key: 'financialDashboard', icon: 'account_balance', feature: 'dashboard_finance' },
];

const moreNavGroups: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: 'moreGroupContent',
    items: [
      { to: '/admin/media', key: 'mediaLibrary', icon: 'photo_library', feature: 'media_library' },
      { to: '/admin/media/upload', key: 'mediaUpload', icon: 'add_photo_alternate', feature: 'upload_media' },
      { to: '/admin/media/approval', key: 'mediaApproval', icon: 'fact_check', feature: 'media_library' },
      { to: '/admin/library', key: 'library', icon: 'menu_book', feature: 'content_library' },
    ],
  },
  {
    titleKey: 'moreGroupOperations',
    items: [
      { to: '/admin/children/enroll', key: 'childEnrollment', icon: 'child_care', feature: 'child_enrollment' },
      { to: '/admin/staff/onboarding', key: 'staffOnboarding', icon: 'assignment_ind', feature: 'staff_onboarding' },
      { to: '/admin/admissions/import', key: 'admissionsImport', icon: 'upload_file', feature: 'admissions' },
      { to: '/admin/inventory', key: 'inventory', icon: 'inventory_2', feature: 'inventory' },
      { to: '/admin/meals', key: 'meals', icon: 'restaurant', feature: 'meals' },
      { to: '/admin/qr-codes', key: 'qrCodes', icon: 'qr_code_2', feature: 'qr_code' },
      { to: '/admin/calendar', key: 'calendar', icon: 'calendar_month', feature: 'event_calendar' },
    ],
  },
  {
    titleKey: 'moreGroupAdvanced',
    items: [
      { to: '/admin/staff/payroll', key: 'payroll', icon: 'payments', feature: 'payroll' },
      { to: '/admin/invoices', key: 'invoices', icon: 'receipt_long', feature: 'invoices' },
      { to: '/admin/reports/financial', key: 'reportsFinancial', icon: 'monitoring', feature: 'financial_reports' },
      { to: '/admin/attendance/dashboard', key: 'attendanceDashboard', icon: 'monitoring', feature: 'dashboard_attendance' },
      { to: '/admin/attendance/logs', key: 'attendanceLogs', icon: 'receipt_long', feature: 'dashboard_attendance' },
      { to: '/admin/health/alerts', key: 'healthAlerts', icon: 'medical_services', feature: 'health_alerts' },
      { to: '/admin/loyalty', key: 'loyalty', icon: 'workspace_premium', feature: 'loyalty' },
      { to: '/admin/messages/broadcasts', key: 'broadcastHistory', icon: 'history', feature: 'broadcast_messages' },
      { to: '/admin/teacher-reminders', key: 'teacherReminders', icon: 'notifications_active', feature: 'notifications' },
      { to: '/admin/reminders', key: 'reminders', icon: 'alarm' },
      { to: '/admin/settings/positions', key: 'rbacPositions', icon: 'work', xoOnly: true },
      { to: '/admin/settings/roles', key: 'rbacRoles', icon: 'shield_person', feature: 'roles_permissions' },
      { to: '/admin/settings/features', key: 'rbacFeatures', icon: 'extension', xoOnly: true },
      { to: '/admin/settings', key: 'settings', icon: 'settings', feature: 'settings' },
    ],
  },
];

export function AdminLayout() {
  const { t, i18n } = useTranslation();
  const setHelpOpen = useHelpAiUiStore((s) => s.setHelpOpen);
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { activeNurseryId, availableNurseries } = useActiveNurseryId();
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const subject = useCurrentSubject();
  // DB-driven feature set for the current user. Reflects the roles the nursery admin manages
  // in /admin/settings/roles. Admin roles (xo / chain / branch) short-circuit to ALL features.
  const allowedFeatures = useAllowedFeatures();
  const allowedSet = useMemo<ReadonlySet<FeatureKey> | null>(
    () => (subject == null ? null : new Set(allowedFeatures)),
    [subject, allowedFeatures],
  );
  const isXo = subject?.role === 'xo_super_admin';
  // Two-layer filter: (1) xoOnly items only show for xo_super_admin (Phase 6
  // lockdown); (2) feature-gated items only show when the user's DB matrix
  // grants that feature.
  const passesGate = (item: NavItem): boolean => {
    if (item.xoOnly && !isXo) return false;
    if (!item.feature) return true;
    return allowedSet == null || allowedSet.has(item.feature);
  };
  const visibleNavItems = useMemo(
    () => (allowedSet == null ? navItems.filter(passesGate) : navItems.filter(passesGate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedSet, isXo],
  );
  const visibleMoreGroups = useMemo(
    () =>
      moreNavGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(passesGate),
        }))
        .filter((group) => group.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedSet, isXo],
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readStoredSidebarCollapsed);
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Private browsing / storage disabled — the toggle still works for this session.
      }
      return next;
    });
  };
  // While pinned mini, hovering (or tabbing focus into) the rail temporarily shows the full
  // sidebar — same as VS Code/Notion's collapsed-rail peek. It only affects the sidebar's own
  // width/content, never the page's content margin below, so nothing reflows while peeking.
  const [peeking, setPeeking] = useState(false);
  const showExpanded = !collapsed || peeking;
  const { data: notifications = [] } = useNotificationsCenter(user?.id);
  const { data: inAppNotifications = [] } = useAdminInAppNotifications(user?.id);
  const mediaPendingQuery = useQuery({
    queryKey: ['admin-media-pending-count', activeNurseryId],
    queryFn: async () => {
      if (!activeNurseryId) return 0;
      const res = await supabase
        .from('media')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', activeNurseryId)
        .eq('status', 'pending_approval');
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
    enabled: Boolean(activeNurseryId),
    staleTime: 5 * 60 * 1000,
  });
  const mediaPending = mediaPendingQuery.data ?? 0;
  const admissionsPendingQuery = useQuery({
    queryKey: ['admin-admissions-pending-count', activeNurseryId],
    queryFn: async () => {
      if (!activeNurseryId) return 0;
      const res = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', activeNurseryId)
        .in('status', ['submitted', 'under_review', 'documents_pending']);
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
    enabled: Boolean(activeNurseryId),
    staleTime: 60 * 1000,
  });
  const admissionsPending = admissionsPendingQuery.data ?? 0;
  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );
  const inAppUnreadCount = useMemo(
    () => inAppNotifications.filter((item) => !item.read).length,
    [inAppNotifications],
  );

  const displayName =
    i18n.language === 'ar'
      ? (profile?.name_ar?.trim() || profile?.name_en?.trim() || '')
      : (profile?.name_en?.trim() || profile?.name_ar?.trim() || '');
  const accountEmail = profile?.email ?? user?.email ?? '';
  const sidebarInitials = getUserInitials(displayName, accountEmail);

  // Keep the active nursery visible without putting the nursery picker in the sidebar.
  const activeNursery = availableNurseries.find((n) => n.id === activeNurseryId);
  const activeNurseryLabel = activeNursery
    ? i18n.language === 'ar'
      ? activeNursery.name_ar?.trim() || activeNursery.name_en?.trim() || ''
      : activeNursery.name_en?.trim() || activeNursery.name_ar?.trim() || ''
    : '';
  const brandTitle = activeNurseryLabel || 'XO Nursery';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OfflineIndicator />
      <aside
        onMouseEnter={() => setPeeking(true)}
        onMouseLeave={() => setPeeking(false)}
        onFocus={() => setPeeking(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPeeking(false);
        }}
        className={cn(
          'no-print fixed start-0 top-0 z-40 flex h-dvh max-h-dvh flex-col overflow-hidden bg-primary p-4 shadow-lg transition-[width] duration-200',
          showExpanded ? 'w-64' : 'w-20',
        )}
      >
        <div
          className={cn(
            'mb-4 shrink-0 flex items-center gap-3 rounded-2xl bg-white/10 p-2',
            !showExpanded && 'flex-col gap-2',
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-bold text-white">XO</div>
          {showExpanded ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white" title={brandTitle}>{brandTitle}</p>
              <p className="text-xs text-white/70">{t('admin.nav.brandSubtitle')}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={t(collapsed ? 'admin.nav.expandSidebar' : 'admin.nav.collapseSidebar')}
            aria-label={t(collapsed ? 'admin.nav.expandSidebar' : 'admin.nav.collapseSidebar')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden>
              {collapsed ? 'left_panel_open' : 'left_panel_close'}
            </span>
          </button>
        </div>
        <nav
          className="admin-sidebar-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden overscroll-y-contain pe-1"
          aria-label={t('admin.nav.sidebarLabel')}
        >
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={NAV_LINK_END_PATHS.has(item.to)}
              title={!showExpanded ? t(`admin.nav.${item.key}`) : undefined}
              aria-label={!showExpanded ? t(`admin.nav.${item.key}`) : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  !showExpanded && 'justify-center px-0',
                  isActive
                    ? 'active bg-white/15 text-white shadow-sm ring-1 ring-white/20'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <span className="material-symbols-outlined shrink-0 text-base opacity-90" aria-hidden>{item.icon}</span>
              {showExpanded ? (
                <>
                  <span className="min-w-0 truncate">{t(`admin.nav.${item.key}`)}</span>
                  {item.key === 'admissions' && admissionsPending > 0 ? (
                    <span className="rounded-full bg-white px-1.5 text-[10px] font-bold leading-5 text-primary shadow-sm">
                      {admissionsPending}
                    </span>
                  ) : null}
                  {item.key === 'notifications' && inAppUnreadCount > 0 ? (
                    <span className="rounded-full bg-white px-1.5 text-[10px] font-bold leading-5 text-primary shadow-sm">
                      {inAppUnreadCount}
                    </span>
                  ) : null}
                  <span className="ms-auto h-1.5 w-1.5 rounded-full bg-white opacity-0 transition-opacity group-[.active]:opacity-80" />
                </>
              ) : item.key === 'admissions' && admissionsPending > 0 ? (
                <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-white" />
              ) : null}
            </NavLink>
          ))}
          <div className="mt-3 border-t border-white/15 pt-3">
            <button
              type="button"
              className={cn(
                'flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white',
                !showExpanded && 'justify-center px-0',
              )}
              aria-expanded={moreOpen}
              title={!showExpanded ? t('admin.nav.more') : undefined}
              aria-label={!showExpanded ? t('admin.nav.more') : undefined}
              onClick={() => setMoreOpen((prev) => !prev)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="material-symbols-outlined shrink-0 text-base" aria-hidden>menu</span>
                {showExpanded ? <span className="truncate">{t('admin.nav.more')}</span> : null}
              </span>
              {showExpanded ? (
                <span className="material-symbols-outlined shrink-0 text-base" aria-hidden>
                  {moreOpen ? 'expand_less' : 'expand_more'}
                </span>
              ) : null}
            </button>
            {moreOpen ? (
              <div className="mt-2 space-y-3">
                {visibleMoreGroups.map((group) => (
                  <div key={group.titleKey} className="space-y-1">
                    {showExpanded ? (
                      <p className="px-3 text-[11px] uppercase tracking-wide text-white/50">
                        {t(`admin.nav.${group.titleKey}`)}
                      </p>
                    ) : null}
                    {group.items.map((item) => (
                      <NavLink
                        key={item.key}
                        to={item.to}
                        end={NAV_LINK_END_PATHS.has(item.to)}
                        title={!showExpanded ? t(`admin.nav.${item.key}`) : undefined}
                        aria-label={!showExpanded ? t(`admin.nav.${item.key}`) : undefined}
                        className={({ isActive }) =>
                          cn(
                            'flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                            !showExpanded && 'justify-center px-0',
                            isActive
                              ? 'bg-white/15 text-white ring-1 ring-white/15'
                              : 'text-white/60 hover:bg-white/10 hover:text-white',
                          )
                        }
                      >
                        <span className="material-symbols-outlined shrink-0 text-base" aria-hidden>{item.icon}</span>
                        {showExpanded ? (
                          <>
                            <span className="min-w-0 truncate">{t(`admin.nav.${item.key}`)}</span>
                            {item.key === 'mediaApproval' && mediaPending > 0 ? (
                              <span className="rounded-full bg-white px-1.5 text-[10px] font-bold leading-5 text-primary shadow-sm">
                                {mediaPending}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </NavLink>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </nav>
        <div className="mt-4 shrink-0 space-y-4 border-t border-white/20 pt-4">
          {isHelpPanelEnabled() ? (
            <Button
              type="button"
              variant="outline"
              title={!showExpanded ? t('help.resources') : undefined}
              aria-label={!showExpanded ? t('help.resources') : undefined}
              className={cn('w-full min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20', !showExpanded && 'px-0')}
              onClick={() => setHelpOpen(true)}
            >
              <span className={cn('material-symbols-outlined text-base', showExpanded && 'me-2')} aria-hidden>
                school
              </span>
              {showExpanded ? t('help.resources') : null}
            </Button>
          ) : null}
          <Button
            title={!showExpanded ? t('admin.addNewEntry') : undefined}
            aria-label={!showExpanded ? t('admin.addNewEntry') : undefined}
            className={cn('w-full bg-white/20 text-white hover:bg-white/30', !showExpanded && 'px-0')}
          >
            <span className={cn('material-symbols-outlined text-base', showExpanded && 'me-2')} aria-hidden>add_circle</span>
            {showExpanded ? t('admin.addNewEntry') : null}
          </Button>
          <div className={cn('flex items-center gap-3', !showExpanded && 'justify-center')}>
            <Avatar title={!showExpanded ? (displayName || t('admin.userMenu.fallbackName')) : undefined}>
              <AvatarFallback className="bg-white/20 text-xs font-semibold text-white">{sidebarInitials}</AvatarFallback>
            </Avatar>
            {showExpanded ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {displayName || t('admin.userMenu.fallbackName')}
                </p>
                <p className="truncate text-xs text-white/60">{accountEmail || '—'}</p>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <div className={cn('min-h-screen transition-[margin] duration-200', collapsed ? 'ms-20' : 'ms-64')}>
        <header className="no-print sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-8 py-4">
            <BackButton />
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute start-3 top-2.5 text-foreground-tertiary">search</span>
              <input
                className="h-11 w-full rounded-full border border-border-subtle bg-surface-low ps-11 pe-3 text-sm outline-none"
                placeholder={t('admin.search')}
              />
            </div>
            <ThemeSwitcher />
            <LanguageToggle />
            <Button variant="outline" size="icon" aria-label={t('admin.notifications.drawerAria')} className="relative" onClick={() => setDrawerOpen(true)}>
              <span className="material-symbols-outlined" aria-hidden>notifications</span>
              {unreadCount > 0 ? (
                <span className="absolute -end-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-white">
                  {unreadCount}
                </span>
              ) : null}
            </Button>
            <AdminUserMenu />
          </div>
        </header>
        <main className="p-8">
          <PWAInstallPrompt />
          <FeatureRouteGuard homePath="/admin">
            <Outlet />
          </FeatureRouteGuard>
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
