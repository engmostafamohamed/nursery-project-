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

import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';
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
import { ChartLegend } from '@/components/ui/ChartLegend';
import { Skeleton } from '@/components/ui/skeleton';
import { StatStrip, StatTile } from '@/components/ui/StatTile';
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
import { STEP_DATE_TIME } from '@/lib/admissionTimeline';
import { applicationStatusUi } from '@/lib/applicationStatus';
import { CHART_CURSOR, CHART_GRID_STROKE, CHART_TOOLTIP_STYLE, chartColor, chartDirection } from '@/lib/chartTheme';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
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

/** A week's attendance rate as a tone: no school days yet stays neutral. */
function weekRateTone(rate: number, schoolDays: number) {
  if (schoolDays === 0) return { text: 'text-on-surface-variant', bar: 'bg-outline' };
  if (rate >= 80) return { text: 'text-success', bar: 'bg-success' };
  if (rate >= 50) return { text: 'text-warning', bar: 'bg-warning' };
  return { text: 'text-error', bar: 'bg-error' };
}

function ParentDashboardAnalyticsPanel({
  children,
  childInsights,
  isLoading,
  attendanceRate,
  presentDays,
  schoolDays,
}: {
  children: ParentDashboardChildCard[];
  childInsights: Record<string, ChildDashboardInsight>;
  isLoading: boolean;
  attendanceRate: number;
  presentDays: number;
  schoolDays: number;
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

  const chart = chartDirection(i18n.dir() === 'rtl', -28);
  const presentLabel = t('parent.dashboard.analytics.present', { defaultValue: 'Present' });
  const absentLabel = t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' });
  const weeklyPresent = dayData.reduce((sum, row) => sum + row.present, 0);
  const weeklyAbsent = dayData.reduce((sum, row) => sum + row.absent, 0);
  const weeklyTotal = weeklyPresent + weeklyAbsent;
  const weeklyRate = weeklyTotal > 0 ? Math.round((weeklyPresent / weeklyTotal) * 100) : 0;
  const pieData = [
    { name: presentLabel, value: weeklyPresent, color: chartColor('success') },
    { name: absentLabel, value: weeklyAbsent, color: chartColor('error') },
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
      name: locale === 'ar' ? child.nameAr || child.nameEn : child.nameEn || child.nameAr,
      present,
      absent,
      rate,
      tone: weekRateTone(rate, total),
    };
  });

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
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

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4 p-4 sm:p-5">
          <StatStrip
            items={[
              {
                icon: 'how_to_reg',
                label: t('parent.dashboard.analytics.monthRate', { defaultValue: '30-day attendance' }),
                value: `${attendanceRate}%`,
                tone: attendanceRate >= 80 ? 'success' : 'warning',
                to: '/parent/attendance',
              },
              {
                icon: 'event_available',
                label: t('parent.dashboard.analytics.presentDays', { defaultValue: 'Present' }),
                value: presentDays,
                tone: 'success',
                to: '/parent/attendance',
              },
              {
                icon: 'event_busy',
                label: t('parent.dashboard.analytics.absentDays', { defaultValue: 'Absent' }),
                value: Math.max(0, schoolDays - presentDays),
                tone: 'error',
                to: '/parent/attendance',
              },
            ]}
          />

          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-on-surface">{t('parent.reports.last7Days')}</p>
              <ChartLegend items={[{ label: presentLabel, color: chartColor('success') }, { label: absentLabel, color: chartColor('error') }]} />
            </div>
            <div className="h-48 sm:h-64">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : dayData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayData} margin={chart.margin}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} {...chart.xAxis} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} {...chart.yAxis} />
                    <Tooltip cursor={CHART_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="present" name={presentLabel} stackId="attendance" fill={chartColor('success')} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="absent" name={absentLabel} stackId="attendance" fill={chartColor('error')} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-on-surface-variant">
                  {t('parent.dashboard.analytics.emptyChart', { defaultValue: 'Attendance chart will appear after the first check-in.' })}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 border-t border-outline-variant bg-surface-container-lowest p-4 sm:p-5 xl:border-s xl:border-t-0">
          <div className="rounded-lg border border-outline-variant bg-surface p-4">
            <p className="text-sm font-semibold text-on-surface">
              {t('parent.dashboard.analytics.weekTitle', { defaultValue: 'This week' })}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative h-28 w-28 shrink-0">
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={56} paddingAngle={pieData.length > 1 ? 3 : 0} stroke="none">
                        {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-full border-[14px] border-surface-high" />
                )}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-on-surface">
                  {weeklyRate}%
                </span>
              </div>
              <dl className="min-w-0 flex-1 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-2 text-on-surface-variant">
                    <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden />
                    {presentLabel}
                  </dt>
                  <dd className="font-semibold tabular-nums text-on-surface">{weeklyPresent}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-2 text-on-surface-variant">
                    <span className="h-2.5 w-2.5 rounded-full bg-error" aria-hidden />
                    {absentLabel}
                  </dt>
                  <dd className="font-semibold tabular-nums text-on-surface">{weeklyAbsent}</dd>
                </div>
              </dl>
            </div>
          </div>

          {childRows.length ? (
            <ul className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant bg-surface">
              {childRows.map((child) => (
                <li key={child.id}>
                  <Link
                    to={`/parent/attendance?child=${child.id}`}
                    className="block px-4 py-3 outline-none transition hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-on-surface" title={child.name}>{child.name}</p>
                      <span className={cn('shrink-0 text-sm font-semibold tabular-nums', child.tone.text)}>{child.rate}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-high">
                      <div className={cn('h-full rounded-full', child.tone.bar)} style={{ width: `${child.rate}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-on-surface-variant">
                      {t('parent.dashboard.analytics.childWeek', {
                        present: child.present,
                        absent: child.absent,
                        defaultValue: '{{present}} present, {{absent}} absent this week',
                      })}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>
    </section>
  );
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <span className="material-symbols-outlined text-base text-primary" aria-hidden>assignment</span>
          {t('parent.dashboard.sectionApplications')}
          {applicationRows.length ? (
            <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">{applicationRows.length}</span>
          ) : null}
        </p>
        <Link to="/parent/applications" className="text-xs font-semibold text-primary hover:underline">
          {t('common.viewAll', { defaultValue: 'View all' })}
        </Link>
      </div>
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
            const submittedAt = row.submitted_at ? formatDateTime(String(row.submitted_at), STEP_DATE_TIME) : '-';
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
                  <ApplicationStatusBadge status={status} className="shrink-0" />
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
  const statusUi = applicationStatusUi(status);
  const balanceDue = invoice?.balanceDue ?? 0;
  const paidAmount = invoice?.paidAmount ?? 0;
  const pendingAmount = invoice?.pendingAmount ?? 0;
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const childName = applicationChildName(application);
  const submittedAt = application.submitted_at ? formatDateTime(String(application.submitted_at), STEP_DATE_TIME) : null;
  const nextAction =
    status === 'rejected'
      ? t('parent.dashboard.admissionCycle.contact', { defaultValue: 'Contact nursery' })
      : invoice && balanceDue > 0
        ? t('payment.payNowAmount', { amount: formatMoneyAmount(balanceDue) })
        : invoice
          ? t('parent.dashboard.admissionCycle.reviewInvoice', { defaultValue: 'Review invoice' })
          : packagesCount > 0
            ? t('parent.dashboard.admissionCycle.choosePackage', { defaultValue: 'Choose package' })
            : t('parent.dashboard.admissionCycle.openApplication', { defaultValue: 'Open application' });

  // Where the application stands: each step is done, the current one, or still to come.
  const steps: Array<{ key: string; icon: string; label: string; detail: string; done: boolean; failed?: boolean }> = [
    {
      key: 'application',
      icon: 'edit_document',
      label: t('parent.dashboard.admissionCycle.steps.application'),
      detail: t(`applications.statuses.${status}`, { defaultValue: status }),
      done: status !== 'draft',
    },
    {
      key: 'package',
      icon: 'inventory_2',
      label: t('parent.dashboard.admissionCycle.steps.package'),
      detail: invoice?.packageName || t('applications.paymentPackage.notSelected', { defaultValue: 'Not selected' }),
      done: Boolean(invoice),
    },
    {
      key: 'payment',
      icon: 'payments',
      label: t('parent.dashboard.admissionCycle.steps.payment'),
      detail: !invoice
        ? t('parent.dashboard.admissionCycle.steps.notYet')
        : balanceDue > 0
          ? t('parent.dashboard.admissionCycle.steps.due', { amount: money(balanceDue) })
          : t('invoice.status.paid'),
      done: Boolean(invoice) && balanceDue <= 0,
    },
    {
      key: 'decision',
      icon: status === 'rejected' ? 'block' : 'verified',
      label: t('parent.dashboard.admissionCycle.steps.decision'),
      detail:
        status === 'approved' || status === 'rejected'
          ? t(`applications.statuses.${status}`)
          : t('parent.dashboard.admissionCycle.steps.waiting'),
      done: status === 'approved',
      failed: status === 'rejected',
    },
  ];
  const currentStep = steps.findIndex((step) => !step.done);

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <SectionHeading icon="assignment">
            {t('parent.dashboard.admissionCycle.title', { defaultValue: 'Admission cycle' })}
          </SectionHeading>
          <p className="mt-3 truncate text-lg font-semibold text-on-surface">
            {childName !== '-' ? childName : t('parent.dashboard.admissionCycle.newApplication')}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm" aria-hidden>schedule</span>
            {submittedAt
              ? `${t('applications.submittedAt')}: ${submittedAt}`
              : t('parent.dashboard.admissionCycle.notSubmitted')}
          </p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${statusUi.className}`}>
          <span className="material-symbols-outlined text-base" aria-hidden>{statusUi.icon}</span>
          {t(`applications.statuses.${status}`, { defaultValue: status })}
        </span>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {steps.map((step, index) => {
            const current = index === currentStep && !step.failed;
            return (
              <li
                key={step.key}
                className={cn(
                  'flex min-w-0 items-start gap-2.5 rounded-lg border p-3',
                  step.failed
                    ? 'border-error/30 bg-error/5'
                    : step.done
                      ? 'border-success/30 bg-success/5'
                      : current
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-outline-variant bg-surface',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    step.failed
                      ? 'bg-error text-on-primary'
                      : step.done
                        ? 'bg-success text-on-primary'
                        : current
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-surface-high text-on-surface-variant',
                  )}
                  aria-hidden
                >
                  <span className="material-symbols-outlined text-base">{step.failed ? 'close' : step.done ? 'check' : step.icon}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase text-on-surface-variant">{step.label}</span>
                  <span className="mt-0.5 line-clamp-2 block break-words text-sm font-semibold leading-5 text-on-surface" title={step.detail}>{step.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <Button asChild className="h-11 w-full rounded-md">
          <Link to={invoice && balanceDue > 0 ? `/parent/invoices/${invoice.id}/pay` : `/parent/applications/${id}`}>
            {nextAction}
            <span className="material-symbols-outlined ms-1 text-base rtl:rotate-180" aria-hidden>arrow_forward</span>
          </Link>
        </Button>
      </div>

      {invoice ? (
        <dl className="grid grid-cols-2 divide-outline-variant border-t border-outline-variant sm:grid-cols-4 sm:divide-x rtl:sm:divide-x-reverse">
          {[
            { label: t('applications.paymentPackage.title', { defaultValue: 'Payment package' }), value: invoice.packageName || '—', tone: 'text-on-surface' },
            { label: t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' }), value: money(balanceDue), tone: balanceDue > 0 ? 'text-error' : 'text-on-surface' },
            { label: t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' }), value: money(paidAmount), tone: 'text-success' },
            {
              label: t('parent.financial.nextDueLabel', { defaultValue: 'Next payment' }),
              value: invoice.dueDate ? formatDate(invoice.dueDate) : '—',
              tone: 'text-on-surface',
              extra:
                pendingAmount > 0
                  ? t('financial.paymentHistory.pending', { amount: formatMoneyAmount(pendingAmount), defaultValue: 'Pending {{amount}}' })
                  : null,
            },
          ].map((fact) => (
            <div key={fact.label} className="p-4">
              <dt className="text-[11px] font-semibold uppercase text-on-surface-variant">{fact.label}</dt>
              <dd className={cn('mt-1 truncate text-sm font-semibold tabular-nums', fact.tone)}>{fact.value}</dd>
              {fact.extra ? <dd className="mt-1 text-xs font-medium text-warning">{fact.extra}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}
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
                      {t('invoice.egpAmount', { amount: formatMoneyAmount(row.amount) })}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <span>
                      <span className="block text-on-surface-variant">{t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}</span>
                      <span className="font-semibold text-success">{t('invoice.egpAmount', { amount: formatMoneyAmount(row.paidAmount) })}</span>
                    </span>
                    <span>
                      <span className="block text-on-surface-variant">{t('invoice.inReview')}</span>
                      <span className="font-semibold text-warning">{t('invoice.egpAmount', { amount: formatMoneyAmount(row.pendingAmount) })}</span>
                    </span>
                    <span>
                      <span className="block text-on-surface-variant">{t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}</span>
                      <span className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: formatMoneyAmount(row.balanceDue) })}</span>
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
      // What is still owed: a partly paid invoice counts only its remaining balance.
      .reduce((sum, r) => sum + r.balance, 0);
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
        outstanding: dueInvoices.reduce((sum, invoice) => sum + invoice.balance / Math.max(invoice.childIds.length, 1), 0),
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
          <div className="grid grid-cols-2 gap-3 p-3 sm:p-4 lg:grid-cols-3 xl:grid-cols-5">
            <StatTile
              className="xl:flex-col xl:items-start xl:gap-2"
              icon="child_care"
              label={t('parent.dashboard.stats.children', { defaultValue: 'Children' })}
              value={activeChildrenCount}
              tone="primary"
              to="/parent/children"
            />
            <StatTile
              className="xl:flex-col xl:items-start xl:gap-2"
              icon="assignment"
              label={t('parent.dashboard.stats.applications', { defaultValue: 'Applications' })}
              value={pendingApplicationsCount}
              tone={pendingApplicationsCount > 0 ? 'warning' : 'success'}
              to="/parent/applications"
            />
            <StatTile
              className="xl:flex-col xl:items-start xl:gap-2"
              icon="payments"
              label={t('parent.dashboard.stats.outstanding', { defaultValue: 'Outstanding' })}
              value={moneyFormatter.format(totalOutstanding)}
              tone={totalOutstanding > 0 ? 'error' : 'success'}
              to="/parent/invoices"
            />
            <StatTile
              className="xl:flex-col xl:items-start xl:gap-2"
              icon="hourglass_top"
              label={t('parent.dashboard.stats.paymentsInReview', { defaultValue: 'Payments in review' })}
              value={inReviewInvoicesCount}
              tone={inReviewInvoicesCount > 0 ? 'warning' : 'neutral'}
              to="/parent/invoices"
            />
            <StatTile
              className="xl:flex-col xl:items-start xl:gap-2"
              icon="notifications"
              label={t('parent.dashboard.stats.unread', { defaultValue: 'Unread' })}
              value={unreadTotal}
              tone={unreadTotal > 0 ? 'warning' : 'neutral'}
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

      <ParentAdminInboxSection />

      <section className="space-y-3">
        <SectionHeading icon="child_care">{t('parent.dashboard.sectionChildren')}</SectionHeading>
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
                childName={i18n.language === 'ar' ? child.nameAr || child.nameEn : child.nameEn || child.nameAr}
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

      <ParentPasswordResetCard profile={profile} />
    </div>
  );
}
