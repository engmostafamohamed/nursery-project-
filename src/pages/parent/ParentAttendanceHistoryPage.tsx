import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
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

import { ChildSelector, useParentChildren } from '@/components/parent/ChildSelector';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllChildrenAttendanceSummary } from '@/hooks/useAllChildrenAttendanceSummary';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useChildAttendanceHistory, type DayAttendanceRow } from '@/hooks/useChildAttendanceHistory';
import { usePagination } from '@/hooks/usePagination';
import { averageMinutesToTimeLabel, minutesFromMidnight } from '@/lib/attendanceAnalytics';
import { cn } from '@/lib/utils';
import { useUserProfile } from '@/hooks/useUserProfile';

type StatusFilter = 'all' | 'present' | 'partial' | 'absent' | 'late';
type RangeFilter = '7' | '14' | '30';
type AttendanceTableRow = DayAttendanceRow & { childId?: string };

function formatDate(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function formatChartDate(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'short',
  });
}

function AttendanceStatCard({
  icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: string;
  label: string;
  value: string | number;
  tone?: 'primary' | 'success' | 'warning' | 'error';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }[tone];

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', toneClass)}>
          <MaterialSymbol name={icon} size="text-xl" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-on-surface-variant">{label}</p>
          <p className="mt-1 break-words text-2xl font-bold text-on-surface">{value}</p>
        </div>
      </div>
    </div>
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
    { value: 'late', label: t('parent.attendanceHistory.lateBadge'), icon: 'schedule' },
  ], [t]);

  const rangeOptions = useMemo<FilterMenuOption<RangeFilter>[]>(() => [
    { value: '7', label: t('parent.attendanceHistory.last7', { defaultValue: 'Last 7 days' }), icon: 'date_range' },
    { value: '14', label: t('parent.attendanceHistory.last14', { defaultValue: 'Last 14 days' }), icon: 'calendar_month' },
    { value: '30', label: t('parent.attendanceHistory.last30', { defaultValue: 'Last 30 days' }), icon: 'calendar_today' },
  ], [t]);

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
    const schoolRows = rangeTableRows.filter((row) => {
      const w = new Date(`${row.date}T12:00:00`).getDay();
      return w !== 0 && w !== 6;
    });
    const presentRows = schoolRows.filter((row) => row.checkIn);
    const absentRows = schoolRows.filter((row) => row.status === 'absent');
    const partialRows = schoolRows.filter((row) => row.status === 'partial');
    const lateRows = rangeTableRows.filter((row) => row.latePickup);
    const mins = rangeTableRows.filter((row) => row.checkIn).map((row) => minutesFromMidnight(row.checkIn!));
    const avgMin = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null;
    const rate = schoolRows.length > 0 ? Math.min(100, Math.round((presentRows.length / schoolRows.length) * 1000) / 10) : 0;
    return {
      rate,
      present: presentRows.length,
      absent: absentRows.length,
      partial: partialRows.length,
      late: lateRows.length,
      avgIn: averageMinutesToTimeLabel(avgMin, i18n.language),
      totalSchoolDays: schoolRows.length,
    };
  }, [i18n.language, rangeTableRows]);

  const chartRows = useMemo(
    () =>
      [...rangeRows].reverse().map((row) => {
        const childRowsForDate = rangeTableRows.filter((childRow) => childRow.date === row.date);
        const rows = isAllMode ? childRowsForDate : [row];
        return {
          date: row.date,
          label: formatChartDate(row.date, locale),
          present: rows.filter((item) => item.checkIn && item.status !== 'partial').length,
          absent: rows.filter((item) => item.status === 'absent').length,
          partial: rows.filter((item) => item.status === 'partial').length,
        };
      }),
    [isAllMode, locale, rangeRows, rangeTableRows],
  );

  const pieRows = useMemo(
    () =>
      [
        { name: t('parent.dashboard.analytics.present', { defaultValue: 'Present' }), value: metrics.present, color: 'rgb(var(--success))' },
        { name: t('parent.attendanceHistory.partial', { defaultValue: 'Partial' }), value: metrics.partial, color: 'rgb(var(--primary))' },
        { name: t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' }), value: metrics.absent, color: 'rgb(var(--error))' },
      ].filter((row) => row.value > 0),
    [metrics.absent, metrics.partial, metrics.present, t],
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
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">
              {t('parent.nav.attendanceHistory', { defaultValue: 'Attendance' })}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-on-surface sm:text-3xl">
              {t('parent.attendanceHistory.title')}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {childName || t('parent.childSelector.allChildren')}
            </p>
          </div>
          <div className={cn('grid gap-3', isMultiChild ? 'sm:grid-cols-3 lg:min-w-[680px]' : 'sm:grid-cols-2 lg:min-w-[460px]')}>
            {isMultiChild ? (
              <ChildSelector
                value={childId}
                onChange={setChildId}
                children={children}
                showAllOption={true}
              />
            ) : null}
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
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5 sm:p-5">
            <AttendanceStatCard
              icon="monitoring"
              label={t('parent.attendanceHistory.attendanceRate', { defaultValue: 'Attendance rate' })}
              value={`${metrics.rate}%`}
              tone={metrics.rate >= 80 ? 'success' : 'warning'}
            />
            <AttendanceStatCard
              icon="event_available"
              label={t('parent.dashboard.analytics.present', { defaultValue: 'Present' })}
              value={metrics.present}
              tone="success"
            />
            <AttendanceStatCard
              icon="event_busy"
              label={t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}
              value={metrics.absent}
              tone="error"
            />
            <AttendanceStatCard
              icon="schedule"
              label={t('parent.attendanceHistory.avgCheckInShort', { defaultValue: 'Avg check-in' })}
              value={metrics.avgIn}
              tone="primary"
            />
            <AttendanceStatCard
              icon="warning"
              label={t('parent.attendanceHistory.latePickupCount', { defaultValue: 'Late pickup' })}
              value={metrics.late}
              tone={metrics.late > 0 ? 'warning' : 'success'}
            />
          </div>
        )}
      </section>

      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest p-4">
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
            </div>
            <div className="h-80 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ left: -24, right: 8, top: 12, bottom: 0 }}>
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
                  <Bar dataKey="partial" stackId="attendance" fill="rgb(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="absent" stackId="attendance" fill="rgb(var(--error))" radius={[4, 4, 0, 0]} />
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
              <div className="h-52">
                {pieRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieRows} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3}>
                        {pieRows.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant text-sm text-on-surface-variant">
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

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-on-surface">
              {t('parent.attendanceHistory.recordsTitle', { defaultValue: 'Attendance records' })}
            </h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              {t('parent.attendanceHistory.filteredCount', {
                count: filteredRows.length,
                defaultValue: '{{count}} records after filters',
              })}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                  <tr>
                    {isAllMode ? (
                      <th className="px-4 py-3 text-start font-semibold">
                        {t('admin.children.childColumn', { defaultValue: 'Child' })}
                      </th>
                    ) : null}
                    <th className="px-4 py-3 text-start font-semibold">{t('parent.attendanceHistory.colDate')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('common.status', { defaultValue: 'Status' })}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('parent.attendanceHistory.colCheckIn')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('parent.attendanceHistory.colCheckOut')}</th>
                    {!isAllMode ? (
                      <th className="px-4 py-3 text-start font-semibold">
                        {t('parent.attendanceHistory.colPickup')}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {pager.pageItems.map((row) => (
                    <tr key={`${row.childId ?? 'child'}-${row.date}`} className="transition hover:bg-surface-container-lowest">
                      {isAllMode ? (
                        <td className="px-4 py-3 align-top font-semibold text-on-surface">
                          {row.childId ? childNameById[row.childId] ?? '-' : '-'}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 align-top font-medium text-on-surface">{formatDate(row.date, locale)}</td>
                      <td className="px-4 py-3 align-top"><StatusBadge row={row} /></td>
                      <td className="px-4 py-3 align-top text-on-surface-variant">{formatTime(row.checkIn)}</td>
                      <td className="px-4 py-3 align-top text-on-surface-variant">{formatTime(row.checkOut)}</td>
                      {!isAllMode ? (
                        <td className="px-4 py-3 align-top">
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
                                <span
                                  className="material-symbols-outlined shrink-0 text-base text-on-surface-variant"
                                  aria-hidden
                                >
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
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {pager.pageItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-on-surface-variant" colSpan={isAllMode ? 5 : 5}>
                        {t('parent.attendanceHistory.noFilteredRecords', { defaultValue: 'No attendance records match these filters.' })}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="p-4">
              <Pagination
                page={pager.page}
                pageCount={pager.pageCount}
                total={pager.total}
                startIndex={pager.startIndex}
                endIndex={pager.endIndex}
                hasPrev={pager.hasPrev}
                hasNext={pager.hasNext}
                onPrev={pager.prev}
                onNext={pager.next}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
