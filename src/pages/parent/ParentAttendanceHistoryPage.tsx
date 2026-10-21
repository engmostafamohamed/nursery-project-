import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
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

import { ChildAttendanceHistory } from '@/components/attendance/ChildAttendanceHistory';
import { ChildSelector } from '@/components/parent/ChildSelector';
import { useParentChildren } from '@/hooks/useParentChildren';
import { ReportAbsencePanel } from '@/components/parent/ReportAbsencePanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  DataTable,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartLegend } from '@/components/ui/ChartLegend';
import { StatStrip, StatTile } from '@/components/ui/StatTile';
import { useAllChildrenAttendanceSummary } from '@/hooks/useAllChildrenAttendanceSummary';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useChildAttendanceHistory, type DayAttendanceRow } from '@/hooks/useChildAttendanceHistory';
import { usePagination } from '@/hooks/usePagination';
import { averageMinutesToTimeLabel, minutesFromMidnight } from '@/lib/attendanceAnalytics';
import { staffName } from '@/lib/attendanceApi';
import { CHART_CURSOR, CHART_GRID_STROKE, CHART_TOOLTIP_STYLE, chartColor, chartDirection } from '@/lib/chartTheme';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useUserProfile } from '@/hooks/useUserProfile';

type StatusFilter = 'all' | 'present' | 'partial' | 'absent' | 'excused' | 'late';
type RangeFilter = '7' | '14' | '30';
type AttendanceTableRow = DayAttendanceRow & { childId?: string };

function formatDate(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

/** Weekday names repeat beyond a week, so longer ranges label bars with the date. */
function formatChartDate(iso: string, locale: string, rangeDays: number): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(
    locale,
    rangeDays > 7 ? { day: 'numeric', month: 'short' } : { weekday: 'short' },
  );
}

function StatusBadge({ row }: { row: DayAttendanceRow }) {
  const { t } = useTranslation();
  if (row.latePickup) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
        <MaterialSymbol name="schedule" size="text-sm" />
        {t('parent.attendanceHistory.lateBadge')}
      </span>
    );
  }
  if (row.status === 'present') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
        <MaterialSymbol name="check_circle" size="text-sm" />
        {t('parent.dashboard.analytics.present', { defaultValue: 'Present' })}
      </span>
    );
  }
  if (row.status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
        <MaterialSymbol name="pending" size="text-sm" />
        {t('parent.attendanceHistory.partial', { defaultValue: 'Partial' })}
      </span>
    );
  }
  if (row.status === 'excused' || row.status === 'off' || row.status === 'holiday') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
        <MaterialSymbol name={row.status === 'excused' ? 'sick' : row.status === 'holiday' ? 'celebration' : 'weekend'} size="text-sm" />
        {t(`attendance.status.${row.status}`)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-error/30 bg-error/10 px-2.5 py-1 text-xs font-semibold text-error">
      <MaterialSymbol name="event_busy" size="text-sm" />
      {t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}
    </span>
  );
}

export function ParentAttendanceHistoryPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [childId, setChildId] = useState(searchParams.get('child') ?? '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30');
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const nurseryId = profile?.nursery_id ?? undefined;

  const childrenQuery = useParentChildren();
  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const isMultiChild = children.length > 1;
  const selectedChildId = childId || (!isMultiChild ? children[0]?.id ?? '' : '');

  const singleReport = useChildAttendanceHistory({
    childId: selectedChildId || undefined,
    nurseryId,
  });

  const allChildIds = useMemo(() => children.map((c) => c.id), [children]);
  const allReport = useAllChildrenAttendanceSummary({
    childIds: allChildIds,
    nurseryId,
  });

  const isAllMode = isMultiChild && !childId;
  const report = isAllMode
    ? { rows: allReport.rows, summary: allReport.summary, isPending: allReport.isPending, child: null }
    : { rows: singleReport.rows, summary: singleReport.summary, isPending: singleReport.isPending, child: singleReport.child };

  const statusOptions = useMemo<FilterMenuOption<StatusFilter>[]>(() => [
    { value: 'all', label: t('common.all', { defaultValue: 'All' }), icon: 'tune' },
    { value: 'present', label: t('parent.dashboard.analytics.present', { defaultValue: 'Present' }), icon: 'event_available' },
    { value: 'partial', label: t('parent.attendanceHistory.partial', { defaultValue: 'Partial' }), icon: 'pending' },
    { value: 'absent', label: t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' }), icon: 'event_busy' },
    { value: 'excused', label: t('attendance.status.excused'), icon: 'sick' },
    { value: 'late', label: t('parent.attendanceHistory.lateBadge'), icon: 'schedule' },
  ], [t]);

  const rangeOptions = useMemo<FilterMenuOption<RangeFilter>[]>(() => [
    { value: '7', label: t('parent.attendanceHistory.last7', { defaultValue: 'Last 7 days' }), icon: 'date_range' },
    { value: '14', label: t('parent.attendanceHistory.last14', { defaultValue: 'Last 14 days' }), icon: 'calendar_month' },
    { value: '30', label: t('parent.attendanceHistory.last30', { defaultValue: 'Last 30 days' }), icon: 'calendar_today' },
  ], [t]);

  const periodLabel = rangeOptions.find((option) => option.value === rangeFilter)?.label;

  const childName = useMemo(() => {
    if (isAllMode) return t('parent.childSelector.allChildren');
    const c = children.find((x) => x.id === selectedChildId);
    if (!c) return '';
    return i18n.language === 'ar' ? (c.nameAr?.trim() || c.nameEn) : (c.nameEn?.trim() || c.nameAr);
  }, [children, selectedChildId, i18n.language, t, isAllMode]);

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const rangeRows = useMemo(
    () => report.rows.slice(0, Number(rangeFilter)),
    [rangeFilter, report.rows],
  );

  const rangeDateSet = useMemo(
    () => new Set(rangeRows.map((row) => row.date)),
    [rangeRows],
  );

  const childNameById = useMemo(() => {
    return children.reduce<Record<string, string>>((acc, child) => {
      acc[child.id] = i18n.language === 'ar'
        ? (child.nameAr?.trim() || child.nameEn)
        : (child.nameEn?.trim() || child.nameAr);
      return acc;
    }, {});
  }, [children, i18n.language]);

  const rangeTableRows = useMemo<AttendanceTableRow[]>(() => {
    if (isAllMode) {
      return allReport.childRows.filter((row) => rangeDateSet.has(row.date));
    }
    return rangeRows.map((row) => ({ ...row, childId: selectedChildId || undefined }));
  }, [allReport.childRows, isAllMode, rangeDateSet, rangeRows, selectedChildId]);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rangeTableRows;
    if (statusFilter === 'late') return rangeTableRows.filter((row) => row.latePickup);
    return rangeTableRows.filter((row) => row.status === statusFilter);
  }, [rangeTableRows, statusFilter]);

  const metrics = useMemo(() => {
    // The server marks each day (working day, holiday, excused); only expected days count.
    const presentRows = rangeTableRows.filter((row) => row.checkIn);
    const absentRows = rangeTableRows.filter((row) => row.status === 'absent');
    const partialRows = rangeTableRows.filter((row) => row.status === 'partial');
    const excusedRows = rangeTableRows.filter((row) => row.status === 'excused');
    const lateRows = rangeTableRows.filter((row) => row.latePickup);
    const mins = presentRows.map((row) => minutesFromMidnight(row.checkIn!));
    const avgMin = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null;
    const expected = presentRows.length + absentRows.length;
    const rate = expected > 0 ? Math.min(100, Math.round((presentRows.length / expected) * 1000) / 10) : 0;
    return {
      rate,
      present: presentRows.length,
      absent: absentRows.length,
      partial: partialRows.length,
      excused: excusedRows.length,
      late: lateRows.length,
      avgIn: averageMinutesToTimeLabel(avgMin, i18n.language),
      totalSchoolDays: expected + excusedRows.length,
      extraHours: rangeTableRows.reduce((sum, row) => sum + (row.detail?.extraHours ?? 0), 0),
      extraHoursCovered: rangeTableRows.reduce((sum, row) => sum + (row.detail?.extraHoursCovered ?? 0), 0),
      extraFee: rangeTableRows.reduce((sum, row) => sum + (row.detail?.extraFee ?? 0), 0),
    };
  }, [i18n.language, rangeTableRows]);

  // Unpaid extra-hours invoices (RLS limits them to this parent's).
  const extraHoursDueQuery = useQuery({
    queryKey: ['parent-extra-hours-due', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, amount, status')
        .eq('invoice_type', 'extra_hours')
        .in('status', ['pending', 'overdue']);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ id: string; amount: number | string }>;
      return { count: rows.length, total: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0) };
    },
    enabled: Boolean(user?.id),
  });
  const extraHoursDue = extraHoursDueQuery.data ?? { count: 0, total: 0 };

  const chartRows = useMemo(
    () =>
      [...rangeRows].reverse().map((row) => {
        const childRowsForDate = rangeTableRows.filter((childRow) => childRow.date === row.date);
        const rows = isAllMode ? childRowsForDate : [row];
        return {
          date: row.date,
          label: formatChartDate(row.date, locale, Number(rangeFilter)),
          present: rows.filter((item) => item.checkIn && item.status !== 'partial').length,
          absent: rows.filter((item) => item.status === 'absent').length,
          partial: rows.filter((item) => item.status === 'partial').length,
        };
      }),
    [isAllMode, locale, rangeFilter, rangeRows, rangeTableRows],
  );

  const chart = chartDirection(i18n.dir() === 'rtl');
  const presentLabel = t('parent.dashboard.analytics.present', { defaultValue: 'Present' });
  const partialLabel = t('parent.attendanceHistory.partial', { defaultValue: 'Partial' });
  const absentLabel = t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' });

  const pieRows = useMemo(
    () =>
      [
        { name: t('parent.dashboard.analytics.present', { defaultValue: 'Present' }), value: metrics.present, color: chartColor('success') },
        { name: t('parent.attendanceHistory.partial', { defaultValue: 'Partial' }), value: metrics.partial, color: chartColor('primary') },
        { name: t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' }), value: metrics.absent, color: chartColor('error') },
        { name: t('attendance.status.excused'), value: metrics.excused, color: chartColor('warning') },
      ].filter((row) => row.value > 0),
    [metrics.absent, metrics.excused, metrics.partial, metrics.present, t],
  );

  const pager = usePagination(
    filteredRows,
    10,
    `${selectedChildId}|${statusFilter}|${rangeFilter}|${filteredRows.length}`,
  );

  const loading = childrenQuery.isPending || report.isPending;

  if (!childrenQuery.isPending && selectedChildId && !report.isPending && !report.child && !isAllMode) {
    return (
      <div className="space-y-4 pb-28">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="history" className="text-primary" size="text-2xl" />
          {t('parent.attendanceHistory.title')}
        </h1>
        <EmptyState
          icon="error_outline"
          title={t('parent.attendanceHistory.unavailableTitle')}
          description={t('parent.attendanceHistory.unavailableDescription')}
        />
      </div>
    );
  }

  if (!loading && !children.length) {
    return (
      <div className="space-y-4 pb-28">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="history" className="text-primary" size="text-2xl" />
          {t('parent.attendanceHistory.title')}
        </h1>
        <EmptyState icon="event_busy" title={t('parent.attendanceHistory.emptyTitle')} description={t('parent.attendanceHistory.emptyDescription')} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-5 pb-28">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex items-center gap-3 bg-surface-container-lowest p-4 sm:gap-4 sm:p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md">
            <MaterialSymbol name="history" size="text-2xl" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">
              {t('parent.nav.attendanceHistory', { defaultValue: 'Attendance' })}
            </p>
            <h1 className="text-2xl font-bold leading-tight text-on-surface sm:text-3xl">
              {t('parent.attendanceHistory.title')}
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {[childName || t('parent.childSelector.allChildren'), isAllMode ? periodLabel : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {isMultiChild ? (
          <div className={cn('grid gap-3 border-t border-outline-variant p-4 sm:p-5', isAllMode ? 'sm:grid-cols-3' : 'sm:max-w-sm')}>
            <ChildSelector value={childId} onChange={setChildId} children={children} showAllOption inline />
            {isAllMode ? (
              <>
                <FilterMenu
                  value={statusFilter}
                  options={statusOptions}
                  onChange={setStatusFilter}
                  label={t('common.status', { defaultValue: 'Status' })}
                />
                <FilterMenu
                  value={rangeFilter}
                  options={rangeOptions}
                  onChange={setRangeFilter}
                  label={t('parent.attendanceHistory.period', { defaultValue: 'Period' })}
                />
              </>
            ) : null}
          </div>
        ) : null}

        {!isAllMode ? null : loading ? (
          <div className="grid grid-cols-2 gap-3 border-t border-outline-variant p-4 sm:p-5 xl:grid-cols-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-3 border-t border-outline-variant p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile
                icon="monitoring"
                label={t('parent.attendanceHistory.attendanceRate', { defaultValue: 'Attendance rate' })}
                value={`${metrics.rate}%`}
                tone={metrics.rate >= 80 ? 'success' : 'warning'}
              />
              <StatTile
                icon="event_available"
                label={t('parent.dashboard.analytics.present', { defaultValue: 'Present' })}
                value={metrics.present}
                tone="success"
              />
              <StatTile
                icon="event_busy"
                label={t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}
                value={metrics.absent}
                tone="error"
              />
              <StatTile
                icon="schedule"
                label={t('parent.attendanceHistory.avgCheckInShort', { defaultValue: 'Avg check-in' })}
                value={metrics.avgIn}
                tone="primary"
              />
            </div>
            <StatStrip
              items={[
                {
                  icon: 'warning',
                  label: t('parent.attendanceHistory.latePickupCount', { defaultValue: 'Late pickup' }),
                  value: metrics.late,
                  tone: metrics.late > 0 ? 'warning' : 'success',
                },
                {
                  icon: 'more_time',
                  label: t('attendance.parent.extraHoursPeriod'),
                  value: metrics.extraHours > 0
                    ? t('attendance.parent.extraHoursValue', {
                        hours: metrics.extraHours,
                        covered: metrics.extraHoursCovered,
                        fee: metrics.extraFee.toFixed(2),
                      })
                    : '0',
                  tone: metrics.extraHours > 0 ? 'warning' : 'success',
                },
                {
                  icon: 'receipt_long',
                  label: t('attendance.parent.extraHoursDue', { count: extraHoursDue.count }),
                  value: t('invoice.egpAmount', { amount: extraHoursDue.total.toFixed(2) }),
                  tone: extraHoursDue.total > 0 ? 'error' : 'success',
                  to: '/parent/invoices',
                },
              ]}
            />
          </div>
        )}
      </section>

      {!isAllMode && extraHoursDue.count > 0 ? (
        <Link
          to="/parent/invoices"
          className="flex items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-on-surface transition-colors hover:bg-error/10"
        >
          <span className="flex items-center gap-2">
            <MaterialSymbol name="receipt_long" className="text-error" />
            {t('attendance.parent.extraHoursDue', { count: extraHoursDue.count })}
          </span>
          <span className="font-semibold tabular-nums">{extraHoursDue.total.toFixed(2)}</span>
        </Link>
      ) : null}

      {children.length ? (
        <ReportAbsencePanel children={children} defaultChildId={selectedChildId || undefined} />
      ) : null}

      {isAllMode ? (
        <>
          {loading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
                <div className="flex flex-col gap-3 border-b border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-on-surface">
                      {t('parent.attendanceHistory.chartTitle', { defaultValue: 'Attendance trend' })}
                    </h2>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {t('parent.attendanceHistory.chartSubtitle', {
                        days: rangeFilter,
                        defaultValue: 'Present, partial, and absent days for the last {{days}} days.',
                      })}
                    </p>
                  </div>
                  <ChartLegend
                    items={[
                      { label: presentLabel, color: chartColor('success') },
                      { label: partialLabel, color: chartColor('primary') },
                      { label: absentLabel, color: chartColor('error') },
                    ]}
                  />
                </div>
                <div className="h-80 p-4 xl:h-auto xl:min-h-80 xl:flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={chart.margin}>
                      <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} minTickGap={8} {...chart.xAxis} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} {...chart.yAxis} />
                      <Tooltip cursor={CHART_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
                      <Bar dataKey="present" name={presentLabel} stackId="attendance" fill={chartColor('success')} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="partial" name={partialLabel} stackId="attendance" fill={chartColor('primary')} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="absent" name={absentLabel} stackId="attendance" fill={chartColor('error')} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <aside className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
                <div className="border-b border-outline-variant bg-surface-container-lowest p-4">
                  <h2 className="text-base font-semibold text-on-surface">
                    {t('parent.attendanceHistory.breakdownTitle', { defaultValue: 'Breakdown' })}
                  </h2>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t('parent.attendanceHistory.schoolDaysCount', {
                      count: metrics.totalSchoolDays,
                      defaultValue: '{{count}} school days',
                    })}
                  </p>
                </div>
                <div className="grid gap-4 p-4">
                  <div className="relative h-52">
                    {pieRows.length ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieRows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={pieRows.length > 1 ? 3 : 0} stroke="none">
                              {pieRows.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                            </Pie>
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          </PieChart>
                        </ResponsiveContainer>
                        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold tabular-nums text-on-surface">{metrics.rate}%</span>
                          <span className="text-xs text-on-surface-variant">
                            {t('parent.attendanceHistory.attendanceRate', { defaultValue: 'Attendance rate' })}
                          </span>
                        </span>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-outline-variant text-sm text-on-surface-variant">
                        {t('parent.attendanceHistory.noChartData', { defaultValue: 'No records yet' })}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 text-sm">
                    {pieRows.map((row) => (
                      <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-lowest px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-on-surface-variant">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                          {row.name}
                        </span>
                        <span className="font-semibold text-on-surface">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </section>
          )}

          <TableCard
            title={t('parent.attendanceHistory.recordsTitle', { defaultValue: 'Attendance records' })}
            count={loading ? undefined : t('parent.attendanceHistory.filteredCount', { count: filteredRows.length, defaultValue: '{{count}} records after filters' })}
            pagination={loading || !filteredRows.length ? null : <TablePagination pager={pager} />}
          >
            {loading ? (
              <TableLoading rows={6} />
            ) : !filteredRows.length ? (
              <TableEmpty
                icon="event_busy"
                title={t('parent.attendanceHistory.noFilteredRecords', { defaultValue: 'No attendance records match these filters.' })}
              />
            ) : (
              <DataTable minWidth={1040}>
                <THead>
                  {isAllMode ? <Th>{t('admin.children.childColumn', { defaultValue: 'Child' })}</Th> : null}
                  <Th>{t('parent.attendanceHistory.colDate')}</Th>
                  <Th>{t('common.status', { defaultValue: 'Status' })}</Th>
                  <Th>{t('parent.attendanceHistory.colCheckIn')}</Th>
                  <Th>{t('parent.attendanceHistory.colCheckOut')}</Th>
                  <Th>{t('attendance.columns.extraTime')}</Th>
                  <Th>{t('attendance.columns.amount')}</Th>
                  <Th>{t('parent.attendanceHistory.colPickup')}</Th>
                </THead>
                <TBody>
                  {pager.pageItems.map((row) => (
                    <Tr key={`${row.childId ?? 'child'}-${row.date}`}>
                      {isAllMode ? (
                        <Td className="align-top font-semibold text-on-surface">
                          {row.childId ? childNameById[row.childId] ?? '-' : '-'}
                        </Td>
                      ) : null}
                      <Td className="whitespace-nowrap align-top font-medium text-on-surface">{formatDate(row.date, locale)}</Td>
                      <Td className="align-top">
                        <StatusBadge row={row} />
                        {row.status === 'excused' && row.detail?.absenceReason ? (
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {t(`attendance.absence.reasons.${row.detail.absenceReason}`)}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="align-top text-on-surface-variant">
                        {formatTime(row.checkIn)}
                        {row.detail?.checkIn ? (
                          <p className="text-xs">
                            {t('attendance.byStaff', { name: staffName(row.detail.checkedInBy, i18n.language) ?? '—' })}
                            {row.detail.checkInMethod ? ` · ${t(`attendance.method.${row.detail.checkInMethod}`)}` : ''}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="align-top text-on-surface-variant">
                        {formatTime(row.checkOut)}
                        {row.detail?.checkOut ? (
                          <p className="text-xs">
                            {t('attendance.byStaff', { name: staffName(row.detail.checkedOutBy, i18n.language) ?? '—' })}
                            {row.detail.checkOutMethod ? ` · ${t(`attendance.method.${row.detail.checkOutMethod}`)}` : ''}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="align-top">
                        {row.detail?.extraHours ? (
                          <div className="text-xs">
                            <p className="font-semibold text-warning">
                              {t('attendance.extraHoursShort', { hours: row.detail.extraHours })}
                            </p>
                            <p className="text-on-surface-variant">
                              {t('attendance.lateMinutes', { minutes: row.detail.lateMinutes })}
                              {row.detail.extraHoursCovered > 0
                                ? ` · ${t('attendance.coveredByPackage', { hours: row.detail.extraHoursCovered })}`
                                : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </Td>
                      <Td className="align-top">
                        {row.detail?.lateChargeWaived ? (
                          <span className="text-xs font-semibold text-success">{t('attendance.waived')}</span>
                        ) : row.detail && row.detail.extraFee > 0 ? (
                          <div className="text-xs">
                            <p className="font-semibold tabular-nums text-on-surface">{row.detail.extraFee.toFixed(2)}</p>
                            {row.detail.invoiceStatus ? (
                              <Link to="/parent/invoices" className="text-primary underline-offset-2 hover:underline">
                                {t(`attendance.invoiceStatus.${row.detail.invoiceStatus}`, { defaultValue: row.detail.invoiceStatus })}
                              </Link>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </Td>
                      <Td className="align-top">
                        {row.pickup?.personName || row.pickup?.photoUrl ? (
                          <div className="flex items-center gap-2">
                            {row.pickup.photoUrl ? (
                              <img
                                src={row.pickup.photoUrl}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-outline-variant"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="material-symbols-outlined shrink-0 text-base text-on-surface-variant" aria-hidden>
                                person
                              </span>
                            )}
                            <span className="truncate text-on-surface">
                              {row.pickup.personName ?? t('parent.attendanceHistory.unknownPickup')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </DataTable>
            )}
          </TableCard>
        </>
      ) : selectedChildId ? (
        <ChildAttendanceHistory childId={selectedChildId} nurseryId={nurseryId} audience="parent" />
      ) : null}
    </div>
  );
}
