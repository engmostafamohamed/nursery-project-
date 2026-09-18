import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { LanguageToggle } from '@/components/LanguageToggle';
import { HelpAiBundle } from '@/components/help/HelpAiBundle';
import { NotificationCenterDrawer } from '@/components/notifications/NotificationCenterDrawer';
import { BackButton } from '@/components/shared/BackButton';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { PWAInstallPrompt } from '@/components/shared/PWAInstallPrompt';
import { UserMenu } from '@/components/shared/UserMenu';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { parentDisplayNameFromProfile, useParentAccountProfile } from '@/hooks/useParentAccountProfile';
import { parentNurseryLabel, useParentNursery } from '@/hooks/useParentNursery';
import { useParentInAppNotifications } from '@/hooks/useParentInAppNotifications';
import { useNotificationsCenter } from '@/hooks/useNotificationsCenter';
import { useParentPushNotifications } from '@/hooks/useParentPushNotifications';
import { supabase } from '@/lib/supabase';
import { isHelpPanelEnabled } from '@/lib/helpAiPreferences';
import { cn } from '@/lib/utils';
import { useHelpAiUiStore } from '@/store/useHelpAiUiStore';

/** Parent shell: bottom nav + header — Wave 6 RTL review (logical spacing, Material icons). */
const primaryNavItems = [
  { to: '/parent', key: 'home', icon: 'home' },
  { to: '/parent/daily-reports', key: 'reports', icon: 'description' },
  { to: '/parent/events', key: 'events', icon: 'calendar_month' },
];

const secondaryNavItems = [
  { to: '/parent/inbox', key: 'inbox', icon: 'inbox' },
  { to: '/parent/chat', key: 'chat', icon: 'forum' },
  { to: '/parent/children', key: 'children', icon: 'child_care' },
  { to: '/parent/applications', key: 'applications', icon: 'assignment' },
  { to: '/parent/attendance', key: 'attendanceHistory', icon: 'history' },
  { to: '/parent/milestones', key: 'milestones', icon: 'trophy' },
  { to: '/parent/media', key: 'media', icon: 'photo_library' },
  { to: '/parent/rewards', key: 'rewards', icon: 'workspace_premium' },
  { to: '/parent/meals', key: 'meals', icon: 'restaurant' },
  { to: '/parent/library', key: 'library', icon: 'menu_book' },
  { to: '/parent/invoices', key: 'invoices', icon: 'receipt_long' },
  { to: '/parent/payment-record', key: 'paymentRecord', icon: 'payments' },
  { to: '/parent/courses', key: 'courses', icon: 'school' },
  { to: '/parent/quarterly-reports', key: 'quarterlyReports', icon: 'grading' },
];

export function ParentLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setHelpOpen = useHelpAiUiStore((s) => s.setHelpOpen);
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: parentAccount } = useParentAccountProfile(user?.id, profile?.nursery_id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const parentDisplayName = parentDisplayNameFromProfile(profile, parentAccount, i18n.language);
  const { data: nursery } = useParentNursery(profile?.nursery_id);
  const nurseryLabel = parentNurseryLabel(nursery, i18n.language);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: notifications = [] } = useNotificationsCenter(user?.id);
  const { data: inAppNotifications = [] } = useParentInAppNotifications(user?.id);
  const [moreOpen, setMoreOpen] = useState(false);
  const mediaBadgeQuery = useQuery({
    queryKey: ['parent-media-badge', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const res = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', 'media_shared')
        .eq('read', false);
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
    enabled: Boolean(user?.id),
  });
  const mediaUnreadCount = mediaBadgeQuery.data ?? 0;
  const reportsBadgeQuery = useQuery({
    queryKey: ['parent-reports-badge', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const res = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', 'daily_report_published')
        .eq('read', false);
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
    enabled: Boolean(user?.id),
  });
  const reportsUnreadCount = reportsBadgeQuery.data ?? 0;
  const notificationUnreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );
  const inAppNotificationUnreadCount = useMemo(
    () => inAppNotifications.filter((item) => !item.read).length,
    [inAppNotifications],
  );
  const { showPrompt, enablePush, dismissPrompt } = useParentPushNotifications(user?.id);

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
    <div className="parent-shell min-h-screen w-full overflow-x-hidden bg-background pb-28 pt-16 sm:pt-[4.25rem] lg:ps-64 lg:pb-0">
      {/* Desktop sidebar — uses the empty side space on wide screens. */}
      <aside className="no-print hidden lg:fixed lg:inset-y-0 lg:start-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-e lg:border-outline-variant lg:bg-surface">
        <div className="flex items-center gap-2 border-b border-outline-variant px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            XO
          </span>
          <span className="text-sm font-semibold text-on-surface">
            {t('parent.nav.brand', { defaultValue: 'XO Nursery' })}
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t('parent.nav.bottomBarLabel')}>
          {[...primaryNavItems, ...secondaryNavItems].map((item) => {
            const badge =
              item.key === 'media'
                ? mediaUnreadCount
                : item.key === 'reports'
                  ? reportsUnreadCount
                  : 0;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === '/parent'}
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
                <span className="min-w-0 flex-1 truncate">{t(`parent.nav.${item.key}`)}</span>
                {badge > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">{badge}</span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-outline-variant p-3">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden>logout</span>
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <OfflineIndicator />
      <header className="no-print fixed inset-x-0 top-0 z-50 border-b border-outline-variant bg-surface/90 shadow-sm backdrop-blur-xl lg:start-64">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 px-2 py-2.5 sm:px-4 sm:py-3 lg:max-w-none lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <BackButton />
            <UserMenu
              profilePath="/parent/profile"
              profileLabel={t('parent.nav.profile')}
              displayNameOverride={parentDisplayName}
            />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold text-on-surface">{parentDisplayName}</p>
              <p className="truncate text-xs text-on-surface-variant">{nurseryLabel || t('parent.atNursery')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
              to="/parent/settings"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-outline-variant bg-surface text-foreground"
              aria-label={t('helpAiPage.title')}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                settings
              </span>
            </Link>
            <ThemeSwitcher className="h-10 w-10" />
            <LanguageToggle className="h-10 w-10 px-0 sm:w-auto sm:px-3" />
          </div>
        </div>
      </header>

      <main className="print-main mx-auto w-full max-w-4xl px-2 py-3 sm:px-4 sm:py-6 lg:max-w-none lg:px-8">
        <PWAInstallPrompt />
        {showPrompt ? (
          <div className="mb-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-sm font-semibold text-on-surface">{t('push.promptTitle')}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{t('push.promptBody')}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void enablePush()}>{t('push.allow')}</Button>
              <Button size="sm" variant="outline" onClick={dismissPrompt}>{t('push.notNow')}</Button>
            </div>
          </div>
        ) : null}
        <Outlet />
      </main>

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-4xl rounded-t-2xl border border-outline-variant bg-surface/90 px-3 py-2.5 backdrop-blur-2xl sm:rounded-t-3xl sm:px-4 sm:py-3 lg:hidden"
        aria-label={t('parent.nav.bottomBarLabel')}
      >
        <ul className="grid grid-cols-4 gap-2">
          {primaryNavItems.map((item) => {
            const badge =
              item.key === 'media'
                ? mediaUnreadCount
                : item.key === 'reports'
                  ? reportsUnreadCount
                  : item.key === 'notifications'
                    ? inAppNotificationUnreadCount
                    : 0;
            return (
              <li key={item.key}>
                <NavLink to={item.to} end={item.to === '/parent'} className="block">
                  {({ isActive }) => (
                    <span
                      className={cn(
                        'flex flex-col items-center gap-1 text-[11px] font-medium transition-colors',
                        isActive ? 'text-primary' : 'text-on-surface-variant',
                      )}
                    >
                      <span
                        className={cn(
                          'relative flex h-8 w-full max-w-[3.5rem] items-center justify-center rounded-full transition-colors',
                          isActive ? 'bg-primary/15' : '',
                        )}
                      >
                        <span className="material-symbols-outlined text-[22px]" aria-hidden>
                          {item.icon}
                        </span>
                        {badge > 0 ? (
                          <span className="absolute end-2 top-0 rounded-full bg-primary px-1 text-[10px] leading-tight text-white">
                            {badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate">{t(`parent.nav.${item.key}`)}</span>
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
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
          className="fixed inset-0 z-40 bg-black/40"
          aria-label={t('common.close')}
          onClick={() => setMoreOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-3xl border border-outline-variant bg-surface p-4 shadow-ambient transition-transform',
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
          {secondaryNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/parent'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2 text-sm text-on-surface-variant',
                  isActive ? 'bg-primary-container text-white' : 'bg-surface-container-lowest',
                )
              }
              onClick={() => setMoreOpen(false)}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>{item.icon}</span>
              {t(`parent.nav.${item.key}`)}
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
        role="parent"
      />
      <HelpAiBundle layoutRole="parent" />
      <ChatWidget
        role="parent"
        currentUserId={user?.id}
        nurseryId={profile?.nursery_id ?? null}
        languagePref={languagePref}
      />
    </div>
  );
}
