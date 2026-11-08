import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Skeleton } from '@/components/ui/skeleton';
import { StatStrip, StatTile } from '@/components/ui/StatTile';
import { NurseryPerformanceTable } from '@/features/xo-platform-dashboard/NurseryPerformanceTable';
import {
  AttendanceTrendChart,
  ChildrenProfilePanel,
  EnrollmentTrendChart,
  MoneyTrendChart,
  OverdueAgingChart,
} from '@/features/xo-platform-dashboard/PlatformCharts';
import {
  AdmissionsPanel,
  CitiesPanel,
  InvoiceStatusPanel,
  PaymentMethodsPanel,
  RecentSignupsPanel,
  SubscriptionsPanel,
  UsersByRolePanel,
} from '@/features/xo-platform-dashboard/PlatformPanels';
import { ratePercent, type PlatformDashboard } from '@/features/xo-platform-dashboard/platformDashboard';
import { useDashboardFormat, type DashboardFormat } from '@/features/xo-platform-dashboard/useDashboardFormat';
import { usePlatformDashboard } from '@/features/xo-platform-dashboard/usePlatformDashboard';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { cn } from '@/lib/utils';

const STAFF_ROLES = new Set(['teacher', 'manager', 'branch_admin']);

// Cards side by side in a grid row stretch to the row's height, so their bottoms line up; min-w-0
// lets a chart shrink with its column.
const CELL = 'min-w-0 [&>section]:h-full';

/** The XO platform home: the whole platform's headline numbers, money, children and nurseries. */
export function XoAdminHomePage() {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const navigate = useNavigate();
  const { setActiveNurseryId } = useActiveNurseryId();
  const { data, error, isFetching, refetch } = usePlatformDashboard();

  const openNursery = useCallback(
    (nurseryId: string) => {
      setActiveNurseryId(nurseryId);
      navigate('/xo-admin/nursery');
    },
    [navigate, setActiveNurseryId],
  );

  const todayLabel = data ? f.day(data.today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="hub"
        eyebrow={todayLabel}
        title={t('xoAdmin.dashboard.title')}
        description={t('xoAdmin.dashboard.subtitle')}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <span className={cn('material-symbols-outlined me-1 text-base', isFetching && 'animate-spin')} aria-hidden>
                refresh
              </span>
              {t('common.refresh')}
            </Button>
            <Button asChild>
              <Link to="/xo-admin/nurseries">
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>apartment</span>
                {t('xoAdmin.dashboard.allNurseries')}
              </Link>
            </Button>
          </>
        }
      >
        {data ? <HeadlineTiles data={data} f={f} /> : <HeadlineSkeleton />}
        {data ? <SecondaryStrip data={data} f={f} /> : <Skeleton className="h-20 rounded-xl" />}
      </PageHeader>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/40 bg-error/5 px-4 py-3">
          <p className="text-sm text-on-surface">{t('xoAdmin.dashboard.errorLoading')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      {data ? (
        // A refresh keeps the current numbers on screen, dimmed, instead of flashing skeletons.
        <div className={cn('space-y-8 transition-opacity', isFetching && 'opacity-60')} aria-busy={isFetching}>
          <section>
            <SectionTitle icon="payments">{t('xoAdmin.dashboard.sections.money')}</SectionTitle>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              <div className={cn('xl:col-span-8', CELL)}>
                <MoneyTrendChart data={data.finance.monthly} />
              </div>
              <div className={cn('xl:col-span-4', CELL)}>
                <InvoiceStatusPanel data={data.finance.by_status} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 [&>section]:min-w-0">
              <OverdueAgingChart data={data.finance.aging} />
              <PaymentMethodsPanel data={data.finance.by_method} />
            </div>
          </section>

          <section>
            <SectionTitle icon="child_care">{t('xoAdmin.dashboard.sections.children')}</SectionTitle>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              <div className={cn('xl:col-span-8', CELL)}>
                <AttendanceTrendChart data={data.attendance} />
              </div>
              <div className={cn('xl:col-span-4', CELL)}>
                <ChildrenProfilePanel data={data.children} />
              </div>
              <div className={cn('xl:col-span-8', CELL)}>
                <EnrollmentTrendChart data={data.children} />
              </div>
              <div className={cn('xl:col-span-4', CELL)}>
                <AdmissionsPanel data={data.admissions} />
              </div>
            </div>
          </section>

          <section>
            <SectionTitle icon="apartment">{t('xoAdmin.dashboard.sections.nurseries')}</SectionTitle>
            <NurseryPerformanceTable rows={data.by_nursery} onOpen={openNursery} />
            <div className="mt-5 grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-4 [&>section]:min-w-0">
              <RecentSignupsPanel rows={data.by_nursery} today={data.today} onOpen={openNursery} />
              <CitiesPanel data={data.nurseries.by_city} />
              <SubscriptionsPanel data={data.nurseries} />
              <UsersByRolePanel data={data.users} />
            </div>
          </section>
        </div>
      ) : !error ? (
        <BodySkeleton />
      ) : null}
    </div>
  );
}

function HeadlineTiles({ data, f }: { data: PlatformDashboard; f: DashboardFormat }) {
  const { t } = useTranslation();
  const roleCount = (role: string) => data.users.by_role.find((r) => r.key === role)?.count ?? 0;
  const staff = data.users.by_role.filter((r) => r.key && STAFF_ROLES.has(r.key)).reduce((sum, r) => sum + r.count, 0);
  const { collected_this_month: collected, collected_last_month: previous } = data.finance;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile
        to="/xo-admin/nurseries"
        icon="apartment"
        label={t('xoAdmin.dashboard.tiles.nurseries')}
        value={f.int(data.nurseries.total)}
        helper={t('xoAdmin.dashboard.tiles.nurseriesHint', {
          active: f.int(data.nurseries.active),
          trial: f.int(data.nurseries.trial),
          fresh: f.int(data.nurseries.new_this_month),
        })}
      />
      <StatTile
        icon="child_care"
        label={t('xoAdmin.dashboard.tiles.children')}
        value={f.int(data.children.active)}
        helper={t('xoAdmin.dashboard.tiles.childrenHint', {
          current: f.int(data.children.new_this_month),
          previous: f.int(data.children.new_last_month),
        })}
      />
      <StatTile
        icon="group"
        label={t('xoAdmin.dashboard.tiles.users')}
        value={f.int(data.users.total)}
        helper={t('xoAdmin.dashboard.tiles.usersHint', { parents: f.int(roleCount('parent')), staff: f.int(staff) })}
      />
      <StatTile
        icon="payments"
        tone="success"
        label={t('xoAdmin.dashboard.tiles.collected')}
        value={f.money(collected)}
        // The month so far against all of last month: an amount, not a percentage that would read
        // as a fall every month's first weeks.
        helper={t('xoAdmin.dashboard.tiles.collectedLastMonth', { amount: f.money(previous) })}
      />
    </div>
  );
}

function SecondaryStrip({ data, f }: { data: PlatformDashboard; f: DashboardFormat }) {
  const { t } = useTranslation();
  const rate = ratePercent(data.attendance.present, data.attendance.expected);
  const status = (s: string) => data.finance.by_status.find((r) => r.status === s);
  const overdue = status('overdue');
  const openCount = (status('pending')?.count ?? 0) + (overdue?.count ?? 0);

  return (
    <StatStrip
      items={[
        {
          icon: 'how_to_reg',
          label: t('xoAdmin.dashboard.strip.attendance'),
          value: rate != null ? f.percent(rate) : '—',
          tone: rate == null ? 'neutral' : rate >= 80 ? 'success' : 'warning',
          helper: t('xoAdmin.dashboard.strip.attendanceHint'),
        },
        {
          icon: 'account_balance_wallet',
          label: t('xoAdmin.dashboard.strip.outstanding'),
          value: f.money(data.finance.outstanding),
          tone: data.finance.outstanding > 0 ? 'warning' : 'success',
          helper: t('xoAdmin.dashboard.money.invoiceCount', { count: openCount, formatted: f.int(openCount) }),
        },
        {
          icon: 'error',
          label: t('xoAdmin.dashboard.strip.overdue'),
          value: f.money(overdue?.amount ?? 0),
          tone: (overdue?.count ?? 0) > 0 ? 'error' : 'success',
          helper: t('xoAdmin.dashboard.money.invoiceCount', { count: overdue?.count ?? 0, formatted: f.int(overdue?.count ?? 0) }),
        },
        {
          icon: 'assignment_ind',
          label: t('xoAdmin.dashboard.strip.applications'),
          value: f.int(data.admissions.applications_pending),
          tone: data.admissions.applications_pending > 0 ? 'warning' : 'neutral',
        },
        {
          icon: 'contact_support',
          label: t('xoAdmin.dashboard.strip.inquiries'),
          value: f.int(data.admissions.inquiries_new),
          tone: data.admissions.inquiries_new > 0 ? 'warning' : 'neutral',
        },
      ]}
    />
  );
}

function HeadlineSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[1, 2, 3, 4].map((k) => (
        <Skeleton key={k} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

function BodySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-xl xl:col-span-8" />
        <Skeleton className="h-80 rounded-xl xl:col-span-4" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
