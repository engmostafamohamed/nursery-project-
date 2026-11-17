import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { endSession } from '@/lib/sessionExpiry';
import { LanguageToggle } from '@/components/LanguageToggle';
import { HelpAiBundle } from '@/components/help/HelpAiBundle';
import { NotificationCenterDrawer } from '@/components/notifications/NotificationCenterDrawer';
import { ReminderAlertHost } from '@/components/notifications/ReminderAlertHost';
import { BackButton } from '@/components/shared/BackButton';
import { FeatureRouteGuard } from '@/components/shared/FeatureRouteGuard';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { PushNotificationsHost } from '@/components/shared/PushNotificationsHost';
import { PWAInstallPrompt } from '@/components/shared/PWAInstallPrompt';
import { UserMenu } from '@/components/shared/UserMenu';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useAllowedFeatures, usePermissionsReady } from '@/hooks/usePermissions';
import { useNotificationsCenter } from '@/hooks/useNotificationsCenter';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';
import { isHelpPanelEnabled } from '@/lib/helpAiPreferences';
import { cn } from '@/lib/utils';
import type { FeatureKey } from '@/lib/permissions/types';
import { useHelpAiUiStore } from '@/store/useHelpAiUiStore';

/** Teacher shell: desktop sidebar (lg+) + bottom nav + header — mirrors ParentLayout.
 *  Each item that maps to a permission feature carries a `feature` key. When set,
 *  the item only renders if the feature is in the allowed set. Items without a
 *  feature (home, profile, settings) are essential navigation and always show. */
type TeacherNavItem = { to: string; key: string; icon: string; feature?: FeatureKey };

const primaryNavItems: TeacherNavItem[] = [
  { to: '/teacher', key: 'home', icon: 'home' },
  { to: '/teacher/tasks', key: 'tasks', icon: 'checklist' },
  { to: '/teacher/attendance', key: 'attendance', icon: 'fact_check', feature: 'dashboard_attendance' },
  { to: '/teacher/events', key: 'events', icon: 'event', feature: 'event_calendar' },
  { to: '/teacher/courses', key: 'courses', icon: 'school', feature: 'courses' },
];

const secondaryNavItems: TeacherNavItem[] = [
  { to: '/teacher/daily-reports', key: 'dailyReports', icon: 'description', feature: 'daily_reports' },
  { to: '/teacher/meals', key: 'meals', icon: 'restaurant' },
  { to: '/teacher/medicines', key: 'medicines', icon: 'medication' },
  { to: '/teacher/report-rates', key: 'reportRates', icon: 'monitoring', feature: 'class_team' },
  { to: '/teacher/milestones', key: 'milestones', icon: 'social_leaderboard', feature: 'daily_reports' },
  { to: '/teacher/reminders', key: 'reminders', icon: 'alarm' },
  { to: '/teacher/absences', key: 'absences', icon: 'event_busy' },
  { to: '/teacher/chat', key: 'chat', icon: 'forum', feature: 'chat' },
  { to: '/teacher/family-messages', key: 'familyMessages', icon: 'outgoing_mail', feature: 'messages' },
  { to: '/teacher/media', key: 'media', icon: 'photo_library', feature: 'media_library' },
  { to: '/teacher/scanner', key: 'scanner', icon: 'qr_code_scanner', feature: 'qr_scanner' },
  { to: '/teacher/classes', key: 'classes', icon: 'school', feature: 'classes' },
  { to: '/teacher/team', key: 'team', icon: 'groups', feature: 'class_team' },
  { to: '/teacher/community', key: 'community', icon: 'diversity_3', feature: 'community' },
  { to: '/teacher/profile', key: 'profile', icon: 'person' },
  { to: '/teacher/settings', key: 'settings', icon: 'settings' },
];

/** Filter helper: keeps items with no `feature` (essential nav) and items whose
 *  feature is in the allowed set. allowedFeatures is null until the matrix
 *  loads — during that brief moment we show the full nav so the page doesn't
 *  flicker empty. */
function filterByFeatures(
  items: TeacherNavItem[],
  allowedFeatures: ReadonlySet<FeatureKey> | null,
): TeacherNavItem[] {
  if (!allowedFeatures) return items;
  return items.filter((item) => !item.feature || allowedFeatures.has(item.feature));
}

export function TeacherLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setHelpOpen = useHelpAiUiStore((s) => s.setHelpOpen);
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const teacherDisplayName =
    (i18n.language === 'ar'
      ? profile?.name_ar?.trim() || profile?.name_en?.trim()
      : profile?.name_en?.trim() || profile?.name_ar?.trim()) || t('teacher.nav.profile');
  const { data: unreadCount = 0 } = useUnreadMessagesCount(user?.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: notifications = [] } = useNotificationsCenter(user?.id);
  // Below lg the sidebar is a drawer: closed until the menu button opens it, and shut again on
  // Escape, on the backdrop, or as soon as the teacher opens another screen.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [navOpen, setNavOpen] = useState(false);
  const drawerShut = !isDesktop && !navOpen;
  const { pathname } = useLocation();
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    setNavPath(pathname);
    setNavOpen(false);
  }
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);
  const notificationUnreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  // Dynamic feature-based filtering from the role the nursery admin gave this user.
  // Until the grants load, allowedSet is null and both arrays render fully
  // (avoids a flash of empty nav while the DB query is in flight).
  const allowedFeatures = useAllowedFeatures();
  const permissionsReady = usePermissionsReady();
  const allowedSet = useMemo<ReadonlySet<FeatureKey> | null>(
    () => (permissionsReady ? new Set(allowedFeatures) : null),
    [permissionsReady, allowedFeatures],
  );
  const visiblePrimary = useMemo(
    () => filterByFeatures(primaryNavItems, allowedSet),
    [allowedSet],
  );
  const visibleSecondary = useMemo(
    () => filterByFeatures(secondaryNavItems, allowedSet),
    [allowedSet],
  );

  const handleLogout = async () => {
    // Always ends the session here, even when the server cannot be reached.
    await endSession('user');
    setNavOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-8 lg:ps-64">
      {/* The backdrop that closes the drawer on a phone or tablet. */}
      {navOpen ? (
        <button
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      {/* One list of screens: a drawer over the page below lg, a fixed sidebar above it. */}
      <aside
        inert={drawerShut}
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-outline-variant bg-surface transition-transform duration-300 ease-in-out lg:z-40 lg:translate-x-0 lg:rtl:translate-x-0',
          drawerShut && '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 border-b border-outline-variant px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            XO
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
            {t('teacher.nav.brand', { defaultValue: 'XO Nursery' })}
          </span>
          <button
            type="button"
            aria-label={t('common.close')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container lg:hidden"
            onClick={() => setNavOpen(false)}
          >
            <span className="material-symbols-outlined text-xl" aria-hidden>close</span>
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t('teacher.nav.bottomBarLabel')}>
          {[...visiblePrimary, ...visibleSecondary].map((item) => {
            const badge = item.key === 'messages' ? unreadCount : 0;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === '/teacher'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                  )
                }
              >
                <span className="material-symbols-outlined text-xl" aria-hidden>
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{t(`teacher.nav.${item.key}`)}</span>
                {badge > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">{badge}</span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-outline-variant p-3">
          <Link
            to="/teacher/profile"
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-container"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {teacherDisplayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-on-surface">{teacherDisplayName}</span>
              <span className="block text-xs text-on-surface-variant">{t('teacher.onDuty')}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden>logout</span>
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <OfflineIndicator />
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 lg:max-w-none lg:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t('common.menu')}
              aria-expanded={navOpen}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-outline-variant bg-surface text-foreground lg:hidden"
              onClick={() => setNavOpen(true)}
            >
              <span className="material-symbols-outlined text-xl" aria-hidden>menu</span>
            </button>
            <BackButton />
            <UserMenu profilePath="/teacher/profile" profileLabel={t('teacher.nav.profile')} />
            <div>
              <p className="text-sm font-semibold text-on-surface">{teacherDisplayName}</p>
              <p className="text-xs text-on-surface-variant">{t('teacher.onDuty')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isHelpPanelEnabled() ? (
              <button
                type="button"
                aria-label={t('help.resources')}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-outline-variant bg-surface text-foreground"
                onClick={() => setHelpOpen(true)}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>
                  help
                </span>
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t('notifications.title')}
              className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full border border-outline-variant bg-surface p-2 text-foreground"
              onClick={() => setDrawerOpen(true)}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>notifications</span>
              {notificationUnreadCount > 0 ? (
                <span className="absolute -end-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-white">
                  {notificationUnreadCount}
                </span>
              ) : null}
            </button>
            <Link
              to="/teacher/settings"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-outline-variant bg-surface text-foreground"
              aria-label={t('helpAiPage.title')}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                settings
              </span>
            </Link>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 lg:max-w-none lg:px-8">
        <PWAInstallPrompt />
        <FeatureRouteGuard homePath="/teacher">
          <Outlet />
        </FeatureRouteGuard>
      </main>

      <NotificationCenterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        userId={user?.id}
        role="teacher"
      />
      <ReminderAlertHost />
      <PushNotificationsHost />
      <HelpAiBundle layoutRole="teacher" />
      <ChatWidget
        role="teacher"
        currentUserId={user?.id}
        nurseryId={profile?.nursery_id ?? null}
        languagePref={languagePref}
      />
    </div>
  );
}
