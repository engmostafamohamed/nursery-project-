import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';
import { LanguageToggle } from '@/components/LanguageToggle';
import { HelpAiBundle } from '@/components/help/HelpAiBundle';
import { NotificationCenterDrawer } from '@/components/notifications/NotificationCenterDrawer';
import { ReminderAlertHost } from '@/components/notifications/ReminderAlertHost';
import { BackButton } from '@/components/shared/BackButton';
import { FeatureRouteGuard } from '@/components/shared/FeatureRouteGuard';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { PWAInstallPrompt } from '@/components/shared/PWAInstallPrompt';
import { UserMenu } from '@/components/shared/UserMenu';
import { Button } from '@/components/ui/button';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useAllowedFeatures, usePermissionsReady } from '@/hooks/usePermissions';
import { useWebPushSetup } from '@/hooks/useWebPushSetup';
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
  { to: '/teacher/attendance', key: 'attendance', icon: 'fact_check', feature: 'dashboard_attendance' },
  { to: '/teacher/events', key: 'events', icon: 'event', feature: 'event_calendar' },
  { to: '/teacher/courses', key: 'courses', icon: 'school', feature: 'courses' },
];

const secondaryNavItems: TeacherNavItem[] = [
  { to: '/teacher/daily-reports', key: 'dailyReports', icon: 'description', feature: 'daily_reports' },
  { to: '/teacher/milestones', key: 'milestones', icon: 'social_leaderboard', feature: 'daily_reports' },
  { to: '/teacher/reminders', key: 'reminders', icon: 'alarm' },
  { to: '/teacher/chat', key: 'chat', icon: 'forum', feature: 'chat' },
  { to: '/teacher/media', key: 'media', icon: 'photo_library', feature: 'media_library' },
  { to: '/teacher/scanner', key: 'scanner', icon: 'qr_code_scanner', feature: 'qr_scanner' },
  { to: '/teacher/classes', key: 'classes', icon: 'school', feature: 'classes' },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const notificationUnreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );
  const { showPrompt, enablePush, dismissPrompt } = useWebPushSetup(user?.id);

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
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(t('common.logoutError'));
      return;
    }
    setMoreOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-32 lg:ps-64 lg:pb-0">
      {/* Desktop sidebar — uses the empty side space on wide screens. */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:start-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-e lg:border-outline-variant lg:bg-surface">
        <div className="flex items-center gap-2 border-b border-outline-variant px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            XO
          </span>
          <span className="text-sm font-semibold text-on-surface">
            {t('teacher.nav.brand', { defaultValue: 'XO Nursery' })}
          </span>
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
        {showPrompt ? (
          <div className="mb-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-sm font-semibold text-on-surface">{t('push.promptTitle')}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{t('push.promptBodyTeacher')}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void enablePush()}>{t('push.allow')}</Button>
              <Button size="sm" variant="outline" onClick={dismissPrompt}>{t('push.notNow')}</Button>
            </div>
          </div>
        ) : null}
        <FeatureRouteGuard homePath="/teacher">
          <Outlet />
        </FeatureRouteGuard>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-4xl rounded-t-3xl border border-outline-variant bg-surface/85 px-4 py-3 backdrop-blur-2xl lg:hidden"
        aria-label={t('teacher.nav.bottomBarLabel')}
      >
        <ul className="grid grid-cols-6 gap-2">
          {visiblePrimary.map((item) => (
            <li key={item.key}>
              <NavLink
                to={item.to}
                end={item.to === '/teacher'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs',
                    isActive
                      ? 'rounded-2xl bg-primary-container px-6 py-2 text-white'
                      : 'text-slate-400',
                  )
                }
              >
                <span className="relative material-symbols-outlined text-base" aria-hidden>
                  {item.icon}
                  {item.key === 'messages' && unreadCount > 0 ? (
                    <span className="absolute -end-2 -top-2 rounded-full bg-primary px-1 text-[10px] text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                </span>
                {t(`teacher.nav.${item.key}`)}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={cn(
                'flex w-full flex-col items-center gap-1 text-[11px] font-medium transition-colors',
                moreOpen ? 'text-primary' : 'text-on-surface-variant',
              )}
              aria-label={t('common.more')}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((prev) => !prev)}
            >
              <span
                className={cn(
                  'flex h-8 w-full max-w-[3.5rem] items-center justify-center rounded-full transition-colors',
                  moreOpen ? 'bg-primary/15' : '',
                )}
              >
                <span className="material-symbols-outlined text-[22px]" aria-hidden>
                  menu
                </span>
              </span>
              {t('common.more')}
            </button>
          </li>
        </ul>
      </nav>
      {moreOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label={t('common.close')}
          onClick={() => setMoreOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-3xl border border-outline-variant bg-surface p-4 shadow-ambient transition-transform lg:hidden',
          moreOpen ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-on-surface">{t('common.more')}</p>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant"
            aria-label={t('common.close')}
            onClick={() => setMoreOpen(false)}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden>close</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 overflow-y-auto pb-4">
          {visibleSecondary.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/teacher'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2 text-sm text-on-surface-variant',
                  isActive ? 'bg-primary-container text-white' : 'bg-surface-container-lowest',
                )
              }
              onClick={() => setMoreOpen(false)}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>{item.icon}</span>
              {t(`teacher.nav.${item.key}`)}
            </NavLink>
          ))}
          <button
            type="button"
            className="col-span-2 flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-error"
            onClick={() => {
              void handleLogout();
            }}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>logout</span>
            {t('common.logout')}
          </button>
        </div>
      </aside>
      <NotificationCenterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        userId={user?.id}
        role="teacher"
      />
      <ReminderAlertHost />
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
