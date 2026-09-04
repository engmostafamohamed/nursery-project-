import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { FinancialSummaryCard } from '@/components/parent/FinancialSummaryCard';
import { ParentAdminInboxSection } from '@/components/parent/ParentAdminInboxSection';
import { ParentChildSummaryCards } from '@/components/parent/ParentChildSummaryCards';
import { ParentDashboardFeedList } from '@/components/parent/ParentDashboardFeedList';
import { ParentDashboardQuickActions } from '@/components/parent/ParentDashboardQuickActions';
import { ParentDashboardScheduleSection } from '@/components/parent/ParentDashboardScheduleSection';
import { ParentPasswordResetCard } from '@/components/parent/ParentPasswordResetCard';
import { Button } from '@/components/ui/button';
import { useApplicationPackagePayment } from '@/hooks/useApplicationPackagePayment';
import { useAllChildrenAttendanceSummary } from '@/hooks/useAllChildrenAttendanceSummary';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useParentDashboardChildren } from '@/hooks/useParentDashboardChildren';
import { useParentDashboardFeed, type ParentDashboardFeedItem } from '@/hooks/useParentDashboardFeed';
import { useParentDashboardSchedule } from '@/hooks/useParentDashboardSchedule';
import { useParentEventPermissions } from '@/hooks/useParentEventPermissions';
import { useParentInAppNotifications } from '@/hooks/useParentInAppNotifications';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn } from '@/lib/utils';

function SectionHeading({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </span>
      <h2 className="text-base font-semibold text-on-surface">{children}</h2>
    </div>
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
    primary: 'bg-primary text-primary-foreground',
    success: 'bg-success text-white',
    warning: 'bg-warning text-white',
    error: 'bg-error text-white',
  }[tone];

  const content = (
    <>
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm', toneClasses)}>
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
    'group flex min-h-[92px] items-center gap-3 rounded-lg border border-outline-variant bg-surface p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md';

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

function admissionStatusUi(status: string) {
  if (status === 'approved') {
    return { icon: 'verified', tone: 'success' as const, className: 'bg-success/10 text-success border-success/30' };
  }
  if (status === 'rejected') {
    return { icon: 'cancel', tone: 'error' as const, className: 'bg-error/10 text-error border-error/30' };
  }
  if (status === 'documents_pending') {
    return { icon: 'upload_file', tone: 'warning' as const, className: 'bg-warning/10 text-warning border-warning/30' };
  }
  if (status === 'submitted' || status === 'under_review') {
    return { icon: 'manage_search', tone: 'primary' as const, className: 'bg-primary/10 text-primary border-primary/30' };
  }
  return { icon: 'edit_document', tone: 'primary' as const, className: 'bg-primary/10 text-primary border-primary/30' };
}

function ParentAdmissionCyclePanel({
  application,
  isLoading,
  invoice,
  packagesCount,
  onAddChild,
  t,
}: {
  application?: Record<string, unknown>;
  isLoading: boolean;
  invoice: ReturnType<typeof useApplicationPackagePayment>['invoice'];
  packagesCount: number;
  onAddChild: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (isLoading) {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
        <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
      </section>
    );
  }

  if (!application) {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeading icon="assignment_add">
            {t('parent.dashboard.admissionCycle.title', { defaultValue: 'Admission cycle' })}
          </SectionHeading>
          <Button type="button" className="h-11 rounded-md" onClick={onAddChild}>
            <span className="material-symbols-outlined me-2 text-base" aria-hidden>person_add</span>
            {t('applications.createApplication', { defaultValue: 'Start application' })}
          </Button>
        </div>
        <p className="mt-4 text-sm text-on-surface-variant">
          {t('parent.dashboard.admissionCycle.empty', {
            defaultValue: 'Start an application to track review status, choose a package, and pay registration fees.',
          })}
        </p>
      </section>
    );
  }

  const id = String(application.id);
  const status = String(application.status ?? 'draft');
  const statusUi = admissionStatusUi(status);
  const balanceDue = invoice?.balanceDue ?? 0;
  const nextAction =
    status === 'rejected'
      ? t('parent.dashboard.admissionCycle.contact', { defaultValue: 'Contact nursery' })
      : invoice && balanceDue > 0
        ? t('payment.payNowAmount', { amount: balanceDue.toFixed(2) })
        : invoice
          ? t('parent.dashboard.admissionCycle.reviewInvoice', { defaultValue: 'Review invoice' })
          : packagesCount > 0
            ? t('parent.dashboard.admissionCycle.choosePackage', { defaultValue: 'Choose package' })
            : t('parent.dashboard.admissionCycle.openApplication', { defaultValue: 'Open application' });

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <SectionHeading icon="assignment">
            {t('parent.dashboard.admissionCycle.title', { defaultValue: 'Admission cycle' })}
          </SectionHeading>
          <p className="mt-3 truncate text-lg font-semibold text-on-surface">{applicationChildName(application)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t('applications.submittedAt')}: {application.submitted_at ? new Date(String(application.submitted_at)).toLocaleDateString() : '-'}
          </p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${statusUi.className}`}>
          <span className="material-symbols-outlined text-base" aria-hidden>{statusUi.icon}</span>
          {t(`applications.statuses.${status}`, { defaultValue: status })}
        </span>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid divide-y divide-outline-variant sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
              {t('parent.dashboard.admissionCycle.status', { defaultValue: 'Application' })}
            </p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {t(`applications.statuses.${status}`, { defaultValue: status })}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
              {t('applications.paymentPackage.title', { defaultValue: 'Payment package' })}
            </p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {invoice?.packageName || t('applications.paymentPackage.notSelected', { defaultValue: 'Not selected' })}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
              {t('financial.paymentHistory.balance', { defaultValue: 'Balance' })}
            </p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {invoice ? t('invoice.egpAmount', { amount: balanceDue.toFixed(2) }) : '-'}
            </p>
          </div>
        </div>
        <div className="border-t border-outline-variant p-4 lg:border-l lg:border-t-0">
          <Button asChild className="h-11 w-full rounded-md">
            <Link to={invoice && balanceDue > 0 ? `/parent/invoices/${invoice.id}/pay` : `/parent/applications/${id}`}>
              {nextAction}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function ParentDashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
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
  const highlightedApplication = useMemo(
    () =>
      applications.parentApplications.find((row) => !['approved', 'rejected'].includes(String(row.status ?? 'draft'))) ??
      applications.parentApplications[0],
    [applications.parentApplications],
  );
  const highlightedApplicationId = highlightedApplication ? String(highlightedApplication.id) : undefined;
  const highlightedApplicationNurseryId =
    typeof highlightedApplication?.nursery_id === 'string' ? highlightedApplication.nursery_id : nurseryId;
  const highlightedApplicationPayment = useApplicationPackagePayment({
    applicationId: highlightedApplicationId,
    parentId: user?.id,
    nurseryId: highlightedApplicationNurseryId,
  });
  const childRows = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const activeChildrenCount = childRows.length;
  const childIds = useMemo(() => childRows.map((child) => child.id), [childRows]);
  const attendanceSummary = useAllChildrenAttendanceSummary({ childIds, nurseryId });

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

  const childInsights = useMemo(() => {
    return childRows.reduce<Record<string, {
      outstanding: number;
      latestInvoiceNumber?: string;
      latestInvoiceStatus?: string;
      absentDays: number;
      attendanceRate: number;
      attendanceCalendar: Array<{ date: string; status: 'present' | 'absent' | 'off' }>;
      relatedUpdate?: { label: string; to: string };
    }>>((acc, child) => {
      const childInvoices = (invoicesQuery.allData ?? []).filter((invoice) => invoice.childIds.includes(child.id));
      const dueInvoices = childInvoices.filter((invoice) => invoice.status === 'pending' || invoice.status === 'overdue');
      const latestInvoice = [...childInvoices].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
      const attendance = attendanceSummary.perChildSummary[child.id];
      const relatedFeed = (feedQuery.data ?? []).find(
        (item): item is Extract<ParentDashboardFeedItem, { kind: 'daily_report' }> =>
          item.kind === 'daily_report' && item.childId === child.id,
      );
      acc[child.id] = {
        outstanding: dueInvoices.reduce((sum, invoice) => sum + invoice.amount / Math.max(invoice.childIds.length, 1), 0),
        latestInvoiceNumber: latestInvoice?.invoiceNumber,
        latestInvoiceStatus: latestInvoice?.status,
        absentDays: attendance?.absentDays ?? 0,
        attendanceRate: attendance?.ratePct ?? 0,
        attendanceCalendar: attendance?.calendar ?? [],
        relatedUpdate: relatedFeed
          ? {
              label: t('parent.dashboard.feed.report', {
                name: i18n.language === 'ar' ? relatedFeed.childNameAr : relatedFeed.childNameEn,
              }),
              to: `/parent/daily-reports?child=${child.id}&date=${relatedFeed.reportDate}`,
            }
          : undefined,
      };
      return acc;
    }, {});
  }, [attendanceSummary.perChildSummary, childRows, feedQuery.data, i18n.language, invoicesQuery.allData, t]);

  const handleAddChild = async () => {
    if (!user?.id || !nurseryId) {
      toast.error(t('applications.notFound'));
      return;
    }
    try {
      const applicationId = await applications.createParentDraft({
        parentId: user.id,
        nurseryId,
        parentProfile: profile,
      });
      navigate(`/parent/applications/${applicationId}?newChild=1`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('payment.errors.actionFailed'));
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md">
                <span className="material-symbols-outlined text-2xl" aria-hidden>waving_hand</span>
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-primary">
                  {t('parent.atNursery')}
                </p>
                <h1 className="font-headline text-2xl font-extrabold text-on-surface sm:text-3xl">
                  {t('parent.dashboard.title')}
                </h1>
                <p className="mt-0.5 max-w-2xl text-sm text-on-surface-variant">
                  {parentName ? `${parentName} - ` : ''}
                  {t('parent.dashboard.subtitle')}
                </p>
              </div>
            </div>
            <Button type="button" className="h-11 w-full rounded-md px-4 shadow-sm sm:w-auto" onClick={() => void handleAddChild()}>
              <span className="material-symbols-outlined me-2 text-base" aria-hidden>person_add</span>
              {t('applications.createApplication', { defaultValue: 'Add child' })}
            </Button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
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
        </div>
      </section>

      <ParentAdmissionCyclePanel
        application={highlightedApplication}
        isLoading={applications.isLoading || highlightedApplicationPayment.isLoading}
        invoice={highlightedApplicationPayment.invoice}
        packagesCount={highlightedApplicationPayment.packages.length}
        onAddChild={() => void handleAddChild()}
        t={t}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ParentAdminInboxSection />
        <ParentPasswordResetCard profile={profile} />
        <DashboardStatCard
          icon="hourglass_top"
          label={t('parent.dashboard.stats.paymentsInReview', { defaultValue: 'Payments in review' })}
          value={inReviewInvoicesCount}
          tone={inReviewInvoicesCount > 0 ? 'warning' : 'success'}
          to="/parent/invoices"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-5">
          <SectionHeading icon="assignment">{t('parent.dashboard.sectionApplications')}</SectionHeading>
          <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
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
                      className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-foreground transition-all hover:border-primary hover:shadow-sm"
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
            children={childRows}
            unreadTotal={unreadTotal}
            isLoading={showChildSkeleton}
            totalOutstanding={totalOutstanding}
            upcomingEventsCount={upcomingEventsCount}
            childInsights={childInsights}
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
