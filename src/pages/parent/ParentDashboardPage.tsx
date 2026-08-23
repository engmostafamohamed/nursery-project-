import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FinancialSummaryCard } from '@/components/parent/FinancialSummaryCard';
import { ParentAdminInboxSection } from '@/components/parent/ParentAdminInboxSection';
import { ParentChildSummaryCards } from '@/components/parent/ParentChildSummaryCards';
import { ParentDashboardFeedList } from '@/components/parent/ParentDashboardFeedList';
import { ParentDashboardQuickActions } from '@/components/parent/ParentDashboardQuickActions';
import { ParentDashboardScheduleSection } from '@/components/parent/ParentDashboardScheduleSection';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentDashboardChildren } from '@/hooks/useParentDashboardChildren';
import { useParentDashboardFeed } from '@/hooks/useParentDashboardFeed';
import { useParentDashboardSchedule } from '@/hooks/useParentDashboardSchedule';
import { useParentEventPermissions } from '@/hooks/useParentEventPermissions';
import { useParentInAppNotifications } from '@/hooks/useParentInAppNotifications';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { useUserProfile } from '@/hooks/useUserProfile';

function SectionHeading({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
      <span className="material-symbols-outlined text-lg text-primary" aria-hidden>
        {icon}
      </span>
      {children}
    </h2>
  );
}

export function ParentDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;

  const childrenQuery = useParentDashboardChildren(user?.id, nurseryId);
  const scheduleQuery = useParentDashboardSchedule(user?.id, profile?.nursery_id ?? null);
  const feedQuery = useParentDashboardFeed(user?.id, nurseryId);
  const notifQuery = useParentInAppNotifications(user?.id);
  const invoicesQuery = useParentInvoices({ parentId: user?.id, status: 'all', sort: 'due_soon' });
  const eventPermissionsQuery = useParentEventPermissions(user?.id);

  const unreadTotal = useMemo(
    () => (notifQuery.data ?? []).filter((n) => !n.read).length,
    [notifQuery.data],
  );

  const totalOutstanding = useMemo(() => {
    return (invoicesQuery.allData ?? [])
      .filter((r) => r.status === 'pending' || r.status === 'overdue')
      .reduce((sum, r) => sum + r.amount, 0);
  }, [invoicesQuery.allData]);

  const upcomingEventsCount = useMemo(() => {
    const now = new Date();
    const perms = eventPermissionsQuery.data ?? [];
    const uniqueEventIds = new Set(
      perms.filter((p) => new Date(p.starts_at) >= now).map((p) => p.event_id),
    );
    return uniqueEventIds.size;
  }, [eventPermissionsQuery.data]);

  const showChildSkeleton = Boolean(user) && (childrenQuery.isPending || !nurseryId);

  const parentName = (() => {
    const ar = profile?.name_ar?.trim() ?? '';
    const en = profile?.name_en?.trim() ?? '';
    return i18n.language.startsWith('ar') ? ar || en : en || ar;
  })();

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-outline-variant bg-gradient-to-br from-primary/10 via-surface-container-lowest to-surface-container-lowest p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <span className="material-symbols-outlined text-2xl" aria-hidden>waving_hand</span>
          </span>
          <div className="min-w-0">
            <h1 className="font-headline text-2xl font-extrabold text-on-surface">
              {t('parent.dashboard.title')}
            </h1>
            <p className="mt-0.5 truncate text-sm text-on-surface-variant">
              {parentName ? `${parentName} · ` : ''}
              {t('parent.dashboard.subtitle')}
            </p>
          </div>
        </div>
      </section>

      <ParentAdminInboxSection />

      <section className="space-y-3">
        <SectionHeading icon="child_care">{t('parent.dashboard.sectionChildren')}</SectionHeading>
        <ParentChildSummaryCards
          children={childrenQuery.data ?? []}
          unreadTotal={unreadTotal}
          isLoading={showChildSkeleton}
          totalOutstanding={totalOutstanding}
          upcomingEventsCount={upcomingEventsCount}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          <SectionHeading icon="calendar_month">{t('parent.dashboard.sectionSchedule')}</SectionHeading>
          <ParentDashboardScheduleSection
            todayEvents={scheduleQuery.data?.todayEvents ?? []}
            upcoming={scheduleQuery.data?.upcoming ?? []}
            pickup={scheduleQuery.data?.pickup ?? { standardEndTime: null, nurseryClosesAt: null }}
            isLoading={Boolean(user) && scheduleQuery.isPending}
          />
        </div>
        <div className="space-y-3 xl:col-span-5">
          <SectionHeading icon="bolt">{t('parent.dashboard.quick.title')}</SectionHeading>
          <ParentDashboardQuickActions />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon="dynamic_feed">{t('parent.dashboard.sectionFeed')}</SectionHeading>
        <ParentDashboardFeedList items={feedQuery.data ?? []} isLoading={Boolean(user) && feedQuery.isPending} />
      </section>

      <section className="space-y-3">
        <SectionHeading icon="payments">{t('parent.dashboard.sectionFinancial')}</SectionHeading>
        <FinancialSummaryCard />
      </section>
    </div>
  );
}
