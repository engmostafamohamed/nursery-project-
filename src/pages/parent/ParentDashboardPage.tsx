import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { FinancialSummaryCard } from '@/components/parent/FinancialSummaryCard';
import { ParentAdminInboxSection } from '@/components/parent/ParentAdminInboxSection';
import { ParentChildSummaryCards } from '@/components/parent/ParentChildSummaryCards';
import { ParentDashboardFeedList } from '@/components/parent/ParentDashboardFeedList';
import { ParentDashboardQuickActions } from '@/components/parent/ParentDashboardQuickActions';
import { ParentDashboardScheduleSection } from '@/components/parent/ParentDashboardScheduleSection';
import { ParentPasswordResetCard } from '@/components/parent/ParentPasswordResetCard';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useParentDashboardChildren } from '@/hooks/useParentDashboardChildren';
import { useParentDashboardFeed } from '@/hooks/useParentDashboardFeed';
import { useParentDashboardSchedule } from '@/hooks/useParentDashboardSchedule';
import { useParentEventPermissions } from '@/hooks/useParentEventPermissions';
import { useParentInAppNotifications } from '@/hooks/useParentInAppNotifications';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';
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

type DashboardStatCardProps = {
  icon: string;
  label: string;
  value: string | number;
  tone: 'primary' | 'success' | 'warning' | 'error';
  to?: string;
};

function DashboardStatCard({ icon, label, value, tone, to }: DashboardStatCardProps) {
  const toneClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }[tone];

  const content = (
    <>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>
        <span className="material-symbols-outlined text-xl" aria-hidden>
          {icon}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium leading-4 text-on-surface-variant">{label}</span>
        <span className="mt-1 block text-xl font-extrabold leading-6 text-on-surface">{value}</span>
      </span>
    </>
  );

  const className =
    'flex min-h-[88px] items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-surface-container';

  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function readText(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

function applicationChildName(row: Record<string, unknown>) {
  const child = (row.child_info_json as Record<string, unknown> | undefined) ?? {};
  return readText(child, 'full_name_en') || readText(child, 'full_name') || readText(child, 'full_name_ar') || '-';
}

export function ParentDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const childrenQuery = useParentDashboardChildren(user?.id, nurseryId);
  const scheduleQuery = useParentDashboardSchedule(user?.id, profile?.nursery_id ?? null);
  const feedQuery = useParentDashboardFeed(user?.id, nurseryId);
  const notifQuery = useParentInAppNotifications(user?.id);
  const invoicesQuery = useParentInvoices({ parentId: user?.id, status: 'all', sort: 'due_soon' });
  const paymentHistory = usePaymentHistory({ parentId: user?.id, nurseryId, limit: 5 });
  const eventPermissionsQuery = useParentEventPermissions(user?.id);
  const applications = useApplications({ parentId: user?.id, nurseryId });
  const applicationRows = useMemo(() => applications.parentApplications.slice(0, 3), [applications.parentApplications]);
  const activeChildrenCount = childrenQuery.data?.length ?? 0;

  const unreadTotal = useMemo(
    () => (notifQuery.data ?? []).filter((n) => !n.read).length,
    [notifQuery.data],
  );

  const pendingApplicationsCount = useMemo(
    () =>
      applications.parentApplications.filter((row) => {
        const status = String(row.status ?? 'draft');
        return status !== 'approved' && status !== 'rejected';
      }).length,
    [applications.parentApplications],
  );

  const inReviewInvoicesCount = useMemo(
    () => (invoicesQuery.allData ?? []).filter((row) => row.inReview).length,
    [invoicesQuery.allData],
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
  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB', {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  const parentName = (() => {
    const ar = profile?.name_ar?.trim() ?? '';
    const en = profile?.name_en?.trim() ?? '';
    return i18n.language.startsWith('ar') ? ar || en : en || ar;
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="space-y-4">
        <div className="max-w-xl rounded-3xl border border-outline-variant bg-gradient-to-br from-primary/10 via-surface-container-lowest to-surface-container-lowest p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <span className="material-symbols-outlined text-2xl" aria-hidden>waving_hand</span>
            </span>
            <div className="min-w-0">
              <h1 className="font-headline text-2xl font-extrabold text-on-surface">
                {t('parent.dashboard.title')}
              </h1>
              <p className="mt-0.5 text-sm text-on-surface-variant">
                {parentName ? `${parentName} - ` : ''}
                {t('parent.dashboard.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStatCard
            icon="child_care"
            label={t('parent.dashboard.stats.children', { defaultValue: 'Children' })}
            value={activeChildrenCount}
            tone="primary"
            to="/parent/profile"
          />
          <DashboardStatCard
            icon="assignment"
            label={t('parent.dashboard.stats.applications', { defaultValue: 'Applications' })}
            value={pendingApplicationsCount}
            tone={pendingApplicationsCount > 0 ? 'warning' : 'success'}
            to={applicationRows[0] ? `/parent/applications/${String(applicationRows[0].id)}` : undefined}
          />
          <DashboardStatCard
            icon="payments"
            label={t('parent.dashboard.stats.outstanding', { defaultValue: 'Outstanding' })}
            value={moneyFormatter.format(totalOutstanding)}
            tone={totalOutstanding > 0 ? 'error' : 'success'}
            to="/parent/invoices"
          />
          <DashboardStatCard
            icon="notifications"
            label={t('parent.dashboard.stats.unread', { defaultValue: 'Unread' })}
            value={unreadTotal}
            tone={unreadTotal > 0 ? 'warning' : 'primary'}
            to="/parent/notifications"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ParentAdminInboxSection />
        <div className="space-y-5">
          <ParentPasswordResetCard profile={profile} />
          <DashboardStatCard
            icon="hourglass_top"
            label={t('parent.dashboard.stats.paymentsInReview', { defaultValue: 'Payments in review' })}
            value={inReviewInvoicesCount}
            tone={inReviewInvoicesCount > 0 ? 'warning' : 'success'}
            to="/parent/invoices"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-5">
          <SectionHeading icon="assignment">{t('parent.dashboard.sectionApplications')}</SectionHeading>
          <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            {applications.isLoading ? (
              <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
            ) : applicationRows.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t('parent.dashboard.noApplications')}</p>
            ) : (
              <div className="grid gap-3">
                {applicationRows.map((row) => {
                  const id = String(row.id);
                  const status = String(row.status ?? 'draft');
                  const submittedAt = row.submitted_at ? new Date(String(row.submitted_at)).toLocaleDateString() : '-';
                  return (
                    <Link
                      key={id}
                      to={`/parent/applications/${id}`}
                      className="rounded-2xl border border-outline-variant bg-surface p-4 text-foreground transition-colors hover:border-primary hover:bg-primary-container/15"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface">{applicationChildName(row)}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">{t('applications.submittedAt')}: {submittedAt}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                          {t(`applications.statuses.${status}`, { defaultValue: status })}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 xl:col-span-7">
          <SectionHeading icon="child_care">{t('parent.dashboard.sectionChildren')}</SectionHeading>
          <ParentChildSummaryCards
            children={childrenQuery.data ?? []}
            unreadTotal={unreadTotal}
            isLoading={showChildSkeleton}
            totalOutstanding={totalOutstanding}
            upcomingEventsCount={upcomingEventsCount}
          />
        </div>
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

      <section className="grid gap-6 xl:grid-cols-12">
        {user?.id && nurseryId ? (
          <div className="space-y-3 xl:col-span-7">
            <SectionHeading icon="forum">{t('parent.dashboard.sectionNurseryChat')}</SectionHeading>
            <ChatPanel
              role="parent"
              currentUserId={user.id}
              nurseryId={nurseryId}
              languagePref={languagePref}
              initialParticipantRole={['branch_admin', 'manager', 'chain_super_admin', 'teacher']}
              className="h-[520px]"
            />
          </div>
        ) : null}
        <div className={user?.id && nurseryId ? 'space-y-3 xl:col-span-5' : 'max-w-2xl space-y-3'}>
          <SectionHeading icon="dynamic_feed">{t('parent.dashboard.sectionFeed')}</SectionHeading>
          <ParentDashboardFeedList items={feedQuery.data ?? []} isLoading={Boolean(user) && feedQuery.isPending} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-5">
          <SectionHeading icon="account_balance_wallet">{t('parent.dashboard.sectionFinancial')}</SectionHeading>
          <FinancialSummaryCard />
        </div>
        <div className="space-y-3 xl:col-span-7">
          <SectionHeading icon="receipt_long">
            {t('financial.paymentHistory.parentDashboardTitle', { defaultValue: 'Recent payment history' })}
          </SectionHeading>
          <PaymentHistoryTable
            rows={paymentHistory.data}
            isLoading={paymentHistory.isLoading}
            showParent={false}
            compact
            linkBase="/parent/invoices"
          />
        </div>
      </section>
    </div>
  );
}
