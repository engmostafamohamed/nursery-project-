import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { FinancialSummaryCard } from '@/components/parent/FinancialSummaryCard';
import { ParentChildBillingCard } from '@/components/parent/ParentChildBillingCard';
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
import { useParentDashboardChildren, type ParentDashboardChildCard } from '@/hooks/useParentDashboardChildren';
import { useParentChildBilling } from '@/hooks/useParentChildBilling';
import { useParentDashboardFeed, type ParentDashboardFeedItem } from '@/hooks/useParentDashboardFeed';
import { useParentDashboardSchedule } from '@/hooks/useParentDashboardSchedule';
import { useParentEventPermissions } from '@/hooks/useParentEventPermissions';
import { useParentInAppNotifications } from '@/hooks/useParentInAppNotifications';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { parentDisplayNameFromProfile, useParentAccountProfile } from '@/hooks/useParentAccountProfile';
import { usePaymentHistory, type PaymentHistoryRow } from '@/hooks/usePaymentHistory';
import { parentNurseryLabel, useParentNursery } from '@/hooks/useParentNursery';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn } from '@/lib/utils';

function SectionHeading({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-8" aria-hidden>
        <span className="material-symbols-outlined text-base sm:text-lg">{icon}</span>
      </span>
      <h2 className="text-sm font-semibold text-on-surface sm:text-base">{children}</h2>
    </div>
  );
}

type DashboardStatCardProps = {
  icon: string;
  label: string;
  value: string | number;
  tone: 'primary' | 'success' | 'warning' | 'error';
  to?: string;
  className?: string;
};

function DashboardStatCard({ icon, label, value, tone, to, className }: DashboardStatCardProps) {
  const toneClasses = {
    primary: 'bg-primary text-primary-foreground',
    success: 'bg-success text-white',
    warning: 'bg-warning text-white',
    error: 'bg-error text-white',
  }[tone];

  const content = (
    <>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm sm:size-11 sm:rounded-xl', toneClasses)}>
        <span className="material-symbols-outlined text-lg sm:text-xl" aria-hidden>
          {icon}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium leading-4 text-on-surface-variant sm:text-xs">{label}</span>
        <span className="mt-0.5 block truncate text-lg font-extrabold leading-6 text-on-surface sm:mt-1 sm:text-xl">{value}</span>
      </span>
    </>
  );

  const cardClassName = cn(
    'group flex min-h-[76px] items-center gap-2 rounded-xl border border-outline-variant bg-surface p-3 shadow-sm transition-all hover:border-primary/50 hover:shadow-md sm:min-h-[92px] sm:gap-3 sm:p-4',
    className,
  );

  return to ? (
    <Link to={to} className={cardClassName}>
      {content}
    </Link>
  ) : (
    <div className={cardClassName}>{content}</div>
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

type ChildDashboardInsight = {
  outstanding: number;
  latestInvoiceNumber?: string;
  latestInvoiceStatus?: string;
  absentDays: number;
  attendanceRate: number;
  attendanceCalendar: Array<{ date: string; status: 'present' | 'absent' | 'off' }>;
  relatedUpdate?: { label: string; to: string };
};

function formatShortDay(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'short',
  }).format(d);
}

function ParentDashboardAnalyticsPanel({
  children,
  childInsights,
  isLoading,
  attendanceRate,
  presentDays,
  schoolDays,
  unreadTotal,
  totalOutstandingLabel,
}: {
  children: ParentDashboardChildCard[];
  childInsights: Record<string, ChildDashboardInsight>;
  isLoading: boolean;
  attendanceRate: number;
  presentDays: number;
  schoolDays: number;
  unreadTotal: number;
  totalOutstandingLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const dayData = useMemo(() => {
    const map = new Map<string, { date: string; present: number; absent: number }>();
    for (const child of children) {
      for (const day of (childInsights[child.id]?.attendanceCalendar ?? []).slice(-7)) {
        if (day.status === 'off') continue;
        const row = map.get(day.date) ?? { date: day.date, present: 0, absent: 0 };
        if (day.status === 'present') row.present += 1;
        if (day.status === 'absent') row.absent += 1;
        map.set(day.date, row);
      }
    }
    return [...map.values()]
      .sort((a, b) => +new Date(`${a.date}T12:00:00`) - +new Date(`${b.date}T12:00:00`))
      .map((row) => ({ ...row, label: formatShortDay(row.date, locale) }));
  }, [childInsights, children, locale]);

  const weeklyPresent = dayData.reduce((sum, row) => sum + row.present, 0);
  const weeklyAbsent = dayData.reduce((sum, row) => sum + row.absent, 0);
  const pieData = [
    { name: t('parent.dashboard.analytics.present', { defaultValue: 'Present' }), value: weeklyPresent, color: 'rgb(var(--success))' },
    { name: t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' }), value: weeklyAbsent, color: 'rgb(var(--error))' },
  ].filter((row) => row.value > 0);

  const childRows = children.map((child) => {
    const insight = childInsights[child.id];
    const week = (insight?.attendanceCalendar ?? []).slice(-7).filter((day) => day.status !== 'off');
    const present = week.filter((day) => day.status === 'present').length;
    const absent = week.filter((day) => day.status === 'absent').length;
    const total = present + absent;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return {
      id: child.id,
      name: locale === 'ar' ? child.nameAr : child.nameEn,
      present,
      absent,
      rate,
    };
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm sm:rounded-xl">
      <div className="flex flex-col gap-3 border-b border-outline-variant bg-surface-container-lowest p-3 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <SectionHeading icon="monitoring">
          {t('parent.dashboard.analytics.title', { defaultValue: 'Weekly family overview' })}
        </SectionHeading>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <Button asChild variant="outline" className="h-9 shrink-0 rounded-md px-3 text-xs sm:h-10 sm:text-sm">
            <Link to="/parent/daily-reports">
              <span className="material-symbols-outlined me-2 text-base" aria-hidden>description</span>
              {t('parent.dashboard.analytics.openReports', { defaultValue: 'Open reports' })}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-9 shrink-0 rounded-md px-3 text-xs sm:h-10 sm:text-sm">
            <Link to="/parent/attendance">
              <span className="material-symbols-outlined me-2 text-base" aria-hidden>history</span>
              {t('parent.dashboard.analytics.openAttendance', { defaultValue: 'Attendance details' })}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <div className="p-3 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <DashboardStatCard
              icon="how_to_reg"
              label={t('parent.dashboard.analytics.monthRate', { defaultValue: '30-day attendance' })}
              value={`${attendanceRate}%`}
              tone={attendanceRate >= 80 ? 'success' : 'warning'}
              to="/parent/attendance"
            />
            <DashboardStatCard
              icon="event_available"
              label={t('parent.dashboard.analytics.presentDays', { defaultValue: 'Present' })}
              value={presentDays}
              tone="success"
              to="/parent/attendance"
            />
            <DashboardStatCard
              icon="event_busy"
              label={t('parent.dashboard.analytics.absentDays', { defaultValue: 'Absent' })}
              value={Math.max(0, schoolDays - presentDays)}
              tone="error"
              to="/parent/attendance"
            />
            <DashboardStatCard
              icon="account_balance_wallet"
              label={t('parent.dashboard.analytics.outstanding', { defaultValue: 'Outstanding' })}
              value={totalOutstandingLabel}
              tone="primary"
              to="/parent/invoices"
            />
          </div>

          <div className="mt-3 h-48 rounded-xl border border-outline-variant bg-surface-container-lowest p-2 sm:mt-4 sm:h-72 sm:p-3">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">{t('common.loading')}</div>
            ) : dayData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayData} margin={{ left: -28, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgb(var(--border-default))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--surface-high))' }}
                    contentStyle={{
                      border: '1px solid rgb(var(--border-default))',
                      borderRadius: 8,
                      background: 'rgb(var(--surface))',
                      color: 'rgb(var(--foreground))',
                    }}
                  />
                  <Bar dataKey="present" stackId="attendance" fill="rgb(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="absent" stackId="attendance" fill="rgb(var(--error))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-on-surface-variant">
                {t('parent.dashboard.analytics.emptyChart', { defaultValue: 'Attendance chart will appear after the first check-in.' })}
              </div>
            )}
          </div>
        </div>

        <aside className="border-t border-outline-variant bg-surface-container-lowest p-3 sm:p-5 xl:border-l xl:border-t-0">
          <div className="grid gap-4">
            <div className="rounded-lg border border-outline-variant bg-surface p-4">
              <p className="text-sm font-semibold text-on-surface">
                {t('parent.dashboard.analytics.weekTitle', { defaultValue: 'This week' })}
              </p>
              <div className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                <div className="h-28 sm:h-32">
                  {pieData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={36} outerRadius={58} paddingAngle={3}>
                          {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-full border border-outline-variant text-xs text-on-surface-variant">
                      0
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-on-surface-variant">{t('parent.dashboard.analytics.present', { defaultValue: 'Present' })}</span>
                    <span className="font-semibold text-success">{weeklyPresent}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-on-surface-variant">{t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}</span>
                    <span className="font-semibold text-error">{weeklyAbsent}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-outline-variant pt-2">
                    <span className="text-on-surface-variant">{t('parent.dashboard.analytics.unread', { defaultValue: 'Unread' })}</span>
                    <span className="font-semibold text-on-surface">{unreadTotal}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
              {childRows.map((child) => (
                <Link
                  key={child.id}
                  to={`/parent/attendance?child=${child.id}`}
                  className="block rounded-lg border border-outline-variant bg-surface p-3 transition hover:border-primary/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-on-surface">{child.name}</p>
                    <span className="shrink-0 text-sm font-semibold text-primary">{child.rate}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-high">
                    <div className="h-full rounded-full bg-success" style={{ width: `${child.rate}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {t('parent.dashboard.analytics.childWeek', {
                      present: child.present,
                      absent: child.absent,
                      defaultValue: '{{present}} present, {{absent}} absent this week',
                    })}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
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

function ParentDashboardApplicationsCard({
  isLoading,
  applicationRows,
  t,
}: {
  isLoading: boolean;
  applicationRows: Record<string, unknown>[];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <article className="flex min-h-[360px] flex-col rounded-2xl border border-outline-variant bg-surface p-3 shadow-sm sm:min-h-[460px] sm:rounded-xl sm:p-4">
      {isLoading ? (
        <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : applicationRows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-sm text-on-surface-variant">
          {t('parent.dashboard.noApplications')}
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
          {applicationRows.map((row) => {
            const id = String(row.id);
            const status = String(row.status ?? 'draft');
            const submittedAt = row.submitted_at ? new Date(String(row.submitted_at)).toLocaleDateString() : '-';
            return (
              <Link
                key={id}
                to={`/parent/applications/${id}`}
                className="block rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-foreground transition-all hover:border-primary hover:shadow-sm sm:rounded-lg"
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
    </article>
  );
}

function ParentAdmissionCyclePanel({
  application,
  isLoading,
  invoice,
  paymentRows,
  paymentHistoryLoading,
  packagesCount,
  onAddChild,
  t,
}: {
  application?: Record<string, unknown>;
  isLoading: boolean;
  invoice: ReturnType<typeof useApplicationPackagePayment>['invoice'];
  paymentRows: PaymentHistoryRow[];
  paymentHistoryLoading: boolean;
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
  const paidAmount = invoice?.paidAmount ?? 0;
  const pendingAmount = invoice?.pendingAmount ?? 0;
  const nextPaymentDate = invoice?.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-';
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
        <div className="grid divide-y divide-outline-variant sm:grid-cols-2 xl:grid-cols-5 sm:divide-x sm:divide-y-0">
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
              {t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}
            </p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {invoice ? t('invoice.egpAmount', { amount: balanceDue.toFixed(2) }) : '-'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
              {t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}
            </p>
            <p className="mt-1 text-sm font-semibold text-success">
              {invoice ? t('invoice.egpAmount', { amount: paidAmount.toFixed(2) }) : '-'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
              {t('parent.financial.nextDueLabel', { defaultValue: 'Next payment' })}
            </p>
            <p className="mt-1 text-sm font-semibold text-on-surface">{nextPaymentDate}</p>
            {pendingAmount > 0 ? (
              <p className="mt-1 text-xs font-medium text-warning">
                {t('financial.paymentHistory.pending', {
                  amount: pendingAmount.toFixed(2),
                  defaultValue: 'Pending {{amount}}',
                })}
              </p>
            ) : null}
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
      {paymentHistoryLoading || paymentRows.length > 0 ? (
        <div className="border-t border-outline-variant bg-surface-container-lowest p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-on-surface">
              {t('financial.paymentHistory.applicationTitle', { defaultValue: 'Application payment history' })}
            </p>
            <Link className="text-xs font-semibold text-primary hover:underline" to="/parent/payment-record">
              {t('common.viewAll', { defaultValue: 'View all' })}
            </Link>
          </div>
          {paymentHistoryLoading ? (
            <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {paymentRows.slice(0, 2).map((row) => (
                <Link
                  key={row.id}
                  to={`/parent/invoices/${row.invoiceId}`}
                  className="rounded-lg border border-outline-variant bg-surface p-3 transition hover:border-primary/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-primary">{row.invoiceNumber}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">{row.description || t(`invoice.types.${row.invoiceType}`)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-on-surface">
                      {t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <span>
                      <span className="block text-on-surface-variant">{t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}</span>
                      <span className="font-semibold text-success">{t('invoice.egpAmount', { amount: row.paidAmount.toFixed(2) })}</span>
                    </span>
                    <span>
                      <span className="block text-on-surface-variant">{t('invoice.inReview')}</span>
                      <span className="font-semibold text-warning">{t('invoice.egpAmount', { amount: row.pendingAmount.toFixed(2) })}</span>
                    </span>
                    <span>
                      <span className="block text-on-surface-variant">{t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}</span>
                      <span className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: row.balanceDue.toFixed(2) })}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ParentDashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const { data: parentNursery } = useParentNursery(nurseryId);
  const { data: parentAccount } = useParentAccountProfile(user?.id, nurseryId);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const childrenQuery = useParentDashboardChildren(user?.id, nurseryId);
  const scheduleQuery = useParentDashboardSchedule(user?.id, profile?.nursery_id ?? null);
  const feedQuery = useParentDashboardFeed(user?.id, nurseryId);
  const notifQuery = useParentInAppNotifications(user?.id);
  const invoicesQuery = useParentInvoices({ parentId: user?.id, status: 'all', sort: 'due_soon' });
  const paymentHistory = usePaymentHistory({ parentId: user?.id, nurseryId, limit: 5 });
  const eventPermissionsQuery = useParentEventPermissions(user?.id);
  const applications = useApplications({ parentId: user?.id, nurseryId });
  const applicationRows = useMemo(() => applications.parentApplications, [applications.parentApplications]);
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
  const highlightedApplicationPaymentHistory = usePaymentHistory({
    applicationId: highlightedApplicationId,
    parentId: user?.id,
    nurseryId: highlightedApplicationNurseryId,
    limit: 3,
  });
  const childRows = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const activeChildrenCount = childRows.length;
  const childIds = useMemo(() => childRows.map((child) => child.id), [childRows]);
  const attendanceSummary = useAllChildrenAttendanceSummary({ childIds, nurseryId });
  const childBillingQuery = useParentChildBilling(childIds);

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

  const parentName = parentDisplayNameFromProfile(profile, parentAccount, i18n.language);

  const childInsights = useMemo(() => {
    return childRows.reduce<Record<string, ChildDashboardInsight>>((acc, child) => {
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
    <div className="w-full max-w-none space-y-4 sm:space-y-6">
      <section className="space-y-3 sm:space-y-4">
        <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm sm:rounded-xl">
          <div className="flex flex-col gap-3 border-b border-outline-variant bg-surface-container-lowest px-3 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md sm:h-12 sm:w-12 sm:rounded-md">
                <span className="material-symbols-outlined text-xl sm:text-2xl" aria-hidden>waving_hand</span>
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase text-primary">
                  {parentNurseryLabel(parentNursery, i18n.language) || t('parent.atNursery')}
                </p>
                <h1 className="font-headline text-xl font-extrabold leading-tight text-on-surface sm:text-3xl">
                  {t('parent.dashboard.title')}
                </h1>
                <p className="mt-0.5 line-clamp-2 max-w-2xl text-xs text-on-surface-variant sm:text-sm">
                  {parentName ? `${parentName} - ` : ''}
                  {t('parent.dashboard.subtitle')}
                </p>
              </div>
            </div>
            <Button type="button" className="h-10 w-full rounded-lg px-4 text-sm shadow-sm sm:h-11 sm:w-auto sm:rounded-md" onClick={() => void handleAddChild()}>
              <span className="material-symbols-outlined me-2 text-base" aria-hidden>person_add</span>
              {t('applications.createApplication', { defaultValue: 'Add child' })}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4 xl:grid-cols-4">
            <DashboardStatCard
              icon="child_care"
              label={t('parent.dashboard.stats.children', { defaultValue: 'Children' })}
              value={activeChildrenCount}
              tone="primary"
              to="/parent/children"
            />
            <DashboardStatCard
              icon="assignment"
              label={t('parent.dashboard.stats.applications', { defaultValue: 'Applications' })}
              value={pendingApplicationsCount}
              tone={pendingApplicationsCount > 0 ? 'warning' : 'success'}
              to="/parent/applications"
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

      <ParentDashboardAnalyticsPanel
        children={childRows}
        childInsights={childInsights}
        isLoading={showChildSkeleton || attendanceSummary.isLoading}
        attendanceRate={attendanceSummary.summary.ratePct}
        presentDays={attendanceSummary.summary.presentDays}
        schoolDays={attendanceSummary.summary.schoolDaysCount}
        unreadTotal={unreadTotal}
        totalOutstandingLabel={moneyFormatter.format(totalOutstanding)}
      />

      <ParentAdmissionCyclePanel
        application={highlightedApplication}
        isLoading={applications.isLoading || highlightedApplicationPayment.isLoading}
        invoice={highlightedApplicationPayment.invoice}
        paymentRows={highlightedApplicationPaymentHistory.data}
        paymentHistoryLoading={highlightedApplicationPaymentHistory.isLoading}
        packagesCount={highlightedApplicationPayment.packages.length}
        onAddChild={() => void handleAddChild()}
        t={t}
      />

      <section className="grid items-stretch gap-3 sm:gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
        <ParentAdminInboxSection />
        <ParentPasswordResetCard profile={profile} />
        <DashboardStatCard
          icon="hourglass_top"
          label={t('parent.dashboard.stats.paymentsInReview', { defaultValue: 'Payments in review' })}
          value={inReviewInvoicesCount}
          tone={inReviewInvoicesCount > 0 ? 'warning' : 'success'}
          to="/parent/invoices"
          className="h-full min-h-[116px] sm:min-h-[150px]"
        />
      </section>

      <section className="space-y-3">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
          <SectionHeading icon="assignment">{t('parent.dashboard.sectionApplications')}</SectionHeading>
          <SectionHeading icon="child_care">{t('parent.dashboard.sectionChildren')}</SectionHeading>
        </div>
        <ParentChildSummaryCards
          leadingCard={
            <ParentDashboardApplicationsCard
              isLoading={applications.isLoading}
              applicationRows={applicationRows}
              t={t}
            />
          }
          children={childRows}
          unreadTotal={unreadTotal}
          isLoading={showChildSkeleton}
          totalOutstanding={totalOutstanding}
          upcomingEventsCount={upcomingEventsCount}
          childInsights={childInsights}
        />
      </section>

      {childRows.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading icon="payments">
            {t('parent.dashboard.sectionBilling', { defaultValue: 'Tuition & extra hours' })}
          </SectionHeading>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
            {childRows.map((child) => (
              <ParentChildBillingCard
                key={child.id}
                childId={child.id}
                childName={child.nameEn || child.nameAr}
                parentId={user?.id}
                billing={childBillingQuery.data?.[child.id]}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-12">
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

      <section className="grid gap-4 sm:gap-6 xl:grid-cols-12">
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

      <section className="grid gap-4 sm:gap-6 xl:grid-cols-12">
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
