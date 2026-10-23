import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ParentReportDetailModal } from '@/components/parent/ParentReportDetailModal';
import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TablePagination } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useParentReports, type ParentReportItem } from '@/hooks/useParentReports';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  formatActivityTag,
  formatMealSlot,
  formatMoodLabel,
  formatNapQuality,
  moodKey,
} from '@/lib/dailyReportDisplay';
import { CHART_CURSOR, CHART_GRID_STROKE, CHART_SERIES, CHART_TOOLTIP_STYLE, chartColor, chartDirection } from '@/lib/chartTheme';
import { dayHeading, groupByDay } from '@/lib/dayGroups';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/** Icon and colours per mood, so a report's mood reads at a glance. */
const MOOD_STYLE: Record<ReturnType<typeof moodKey>, { icon: string; pill: string }> = {
  happy: { icon: 'sentiment_very_satisfied', pill: 'bg-success/10 text-success' },
  content: { icon: 'sentiment_satisfied', pill: 'bg-primary/10 text-primary' },
  fussy: { icon: 'sentiment_neutral', pill: 'bg-warning/10 text-warning' },
  cranky: { icon: 'sentiment_dissatisfied', pill: 'bg-error/10 text-error' },
};

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
}

function formatDateLabel(value: string, locale: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}

function ReportFact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-container-lowest px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant">
        <MaterialSymbol name={icon} size="text-sm" className="text-primary" />
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-on-surface" title={value}>{value}</p>
    </div>
  );
}

function ReportCard({
  report,
  locale,
  onOpen,
}: {
  report: ParentReportItem;
  locale: string;
  onOpen: (report: ParentReportItem) => void;
}) {
  const { t } = useTranslation();
  const mood = formatMoodLabel(t, report.mood.mood);
  const moodStyle = MOOD_STYLE[moodKey(report.mood.mood)];
  const notes = report.specialNotes?.trim();
  const publishedTime = report.publishedAt
    ? new Date(report.publishedAt).toLocaleTimeString(locale.startsWith('ar') ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;
  const napMinutes = Number(report.nap.duration_minutes ?? 0);
  const activities = (
    (report.activities.tags as string[] | undefined) ??
    (report.activities.participated_in as string[] | undefined) ??
    []
  ).map((tag) => formatActivityTag(t, tag));

  return (
    <article className="group flex overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <button type="button" className="flex w-full flex-col p-4 text-start outline-none focus-visible:bg-surface-container-lowest" onClick={() => onOpen(report)}>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden>
              {initialsOf(report.childName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-on-surface" title={report.childName}>{report.childName}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-on-surface-variant">
                <MaterialSymbol name="school" size="text-sm" />
                {report.teacherName}
              </p>
            </div>
          </div>
          {mood ? (
            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', moodStyle.pill)}>
              <MaterialSymbol name={moodStyle.icon} size="text-base" />
              {mood}
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid w-full grid-cols-3 gap-2">
          <ReportFact
            icon="restaurant"
            label={t('parent.reports.sections.meals')}
            value={formatMealSlot(t, report.meals.lunch as Record<string, unknown> | undefined) || '-'}
          />
          <ReportFact
            icon="bedtime"
            label={t('parent.reports.sections.nap')}
            value={(napMinutes ? `${napMinutes} ${t('parent.reports.minutes')}` : formatNapQuality(t, report.nap.quality)) || '-'}
          />
          <ReportFact icon="toys" label={t('parent.reports.sections.activities')} value={activities[0] || '-'} />
        </div>

        <div className="mt-3 w-full flex-1">
          {notes ? (
            <p className="flex gap-2 rounded-lg border-s-4 border-primary/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface">
              <MaterialSymbol name="format_quote" size="text-base" className="mt-0.5 shrink-0 text-primary" />
              <span className="line-clamp-2">{notes}</span>
            </p>
          ) : activities.length > 1 ? (
            // No note: the activities the tile had no room for.
            <ul className="flex flex-wrap gap-1.5">
              {activities.slice(1, 4).map((activity) => (
                <li key={activity} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {activity}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-3 flex w-full items-center justify-between gap-3 border-t border-outline-variant pt-3">
          <p className="flex items-center gap-1 text-xs text-on-surface-variant">
            <MaterialSymbol name="schedule" size="text-sm" />
            {publishedTime ? t('parent.reports.publishedAtTime', { time: publishedTime }) : formatDateLabel(report.reportDate, locale)}
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
            {t('parent.reports.viewFull')}
            <MaterialSymbol name="chevron_right" size="text-base" className="transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </span>
        </div>
      </button>
    </article>
  );
}

export function ParentDailyReportsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const userId = user?.id;
  const { data: profile } = useUserProfile(user?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [childId, setChildId] = useState(searchParams.get('child') ?? '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const reports = useParentReports({
    parentId: userId,
    nurseryId: profile?.nursery_id ?? undefined,
    childId: childId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    sort,
  });

  const activeReport = useMemo(() => {
    const reportId = searchParams.get('report');
    const routeChild = searchParams.get('child');
    const routeDate = searchParams.get('date');
    if (reportId) return reports.reports.find((report) => report.id === reportId) ?? null;
    if (routeChild && routeDate) {
      return reports.reports.find((report) => report.childId === routeChild && report.reportDate === routeDate) ?? null;
    }
    return null;
  }, [reports.reports, searchParams]);

  const activeIndex = useMemo(
    () => (activeReport ? reports.reports.findIndex((report) => report.id === activeReport.id) : -1),
    [activeReport, reports.reports],
  );

  const markRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('user_id', userId)
      .eq('type', 'daily_report_published')
      .eq('read', false);
  }, [userId]);

  useEffect(() => {
    if (activeReport) void markRead();
  }, [activeReport, markRead]);

  const openReport = (report: ParentReportItem) => {
    setSearchParams({ child: report.childId, date: report.reportDate, report: report.id });
  };

  const closeReport = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('child');
      next.delete('date');
      next.delete('report');
      return next;
    });
  };

  const chartRows = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const iso = date.toISOString().slice(0, 10);
      return { iso, label: formatDateLabel(iso, i18n.language, { weekday: 'short' }), reports: 0 };
    });
    const byDate = new Map(days.map((day) => [day.iso, day]));
    reports.reports.forEach((report) => {
      const day = byDate.get(report.reportDate);
      if (day) day.reports += 1;
    });
    return days;
  }, [reports.reports, i18n.language]);

  const moodRows = useMemo(() => {
    const counts = new Map<string, number>();
    reports.reports.forEach((report) => {
      const label = formatMoodLabel(t, report.mood.mood);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  }, [reports.reports, t]);

  const chart = chartDirection(i18n.dir() === 'rtl', -20);
  const weekReportCount = chartRows.reduce((sum, day) => sum + day.reports, 0);
  const moodTotal = moodRows.reduce((sum, row) => sum + row.value, 0);
  const filtersActive = Boolean(childId || fromDate || toDate || sort !== 'newest');
  const clearFilters = () => {
    setChildId('');
    setFromDate('');
    setToDate('');
    setSort('newest');
  };

  const latestReport = reports.reports[0];
  const uniqueChildrenWithReports = new Set(reports.reports.map((report) => report.childId)).size;
  const pager = usePagination(reports.reports, 6, `${childId}|${fromDate}|${toDate}|${sort}|${reports.reports.length}`);
  const reportGroups = groupByDay(pager.pageItems, (report) => report.reportDate);

  return (
    <div className="w-full max-w-none space-y-5 pb-28">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md">
              <MaterialSymbol name="assignment" size="text-2xl" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">
                {t('parent.reports.eyebrow', { defaultValue: 'Daily updates' })}
              </p>
              <h1 className="text-2xl font-bold leading-tight text-on-surface sm:text-3xl">{t('parent.reports.title')}</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                {t('parent.reports.subtitle', {
                  defaultValue: 'Meals, naps, mood, activities, and teacher notes in one place.',
                })}
              </p>
            </div>
          </div>
          <div className="flex w-fit shrink-0 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <MaterialSymbol name="event" size="text-lg" className="text-primary" />
            <div>
              <p className="text-[11px] font-semibold text-on-surface-variant">{t('parent.reports.stats.lastReport')}</p>
              <p className="text-sm font-bold text-on-surface">
                {latestReport ? formatDateLabel(latestReport.reportDate, i18n.language) : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-outline-variant p-4 sm:p-5 xl:grid-cols-4">
          <StatTile
            icon="calendar_month"
            label={t('parent.reports.stats.thisWeek')}
            value={reports.stats.thisWeek}
            helper={t('parent.reports.last7Days', { defaultValue: 'Last 7 days' })}
          />
          <StatTile
            icon="event_note"
            label={t('parent.reports.stats.thisMonth')}
            value={reports.stats.thisMonth}
            tone="success"
            helper={t('parent.reports.currentMonth', { defaultValue: 'Current month' })}
          />
          <StatTile
            icon="notifications"
            label={t('parent.dashboard.unread', { defaultValue: 'Unread' })}
            value={reports.unreadCount}
            tone={reports.unreadCount > 0 ? 'warning' : 'neutral'}
            helper={t('parent.reports.newUpdates', { defaultValue: 'New published reports' })}
          />
          <StatTile
            icon="child_care"
            label={t('parent.reports.childrenCovered', { defaultValue: 'Children covered' })}
            value={uniqueChildrenWithReports || reports.children.length}
            helper={latestReport?.childName ?? t('parent.reports.allChildren')}
          />
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] lg:items-end">
          <label className="min-w-0 space-y-1">
            <span className="block text-xs font-semibold text-on-surface-variant">{t('common.child', { defaultValue: 'Child' })}</span>
            <Select value={childId} onChange={(event) => setChildId(event.target.value)}>
              <option value="">{t('parent.reports.allChildren')}</option>
              {reports.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-xs font-semibold text-on-surface-variant">{t('common.fromDate', { defaultValue: 'From date' })}</span>
            <Input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-xs font-semibold text-on-surface-variant">{t('common.toDate', { defaultValue: 'To date' })}</span>
            <Input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-xs font-semibold text-on-surface-variant">{t('common.sort', { defaultValue: 'Sort' })}</span>
            <Select value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'oldest')}>
              <option value="newest">{t('parent.reports.sortNewest')}</option>
              <option value="oldest">{t('parent.reports.sortOldest')}</option>
            </Select>
          </label>
          <Button type="button" variant="ghost" className="w-fit" onClick={clearFilters} disabled={!filtersActive}>
            <MaterialSymbol name="filter_alt_off" size="text-base" className="me-1" />
            {t('common.clearFilters')}
          </Button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-on-surface">
            {t('parent.reports.trendTitle', { defaultValue: 'Report activity' })}
          </h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {t('parent.reports.trendSubtitle', { defaultValue: 'Published daily reports across the last week.' })}
          </p>
          <div className="mt-4 h-64 min-w-0 xl:h-auto xl:min-h-64 xl:flex-1">
            {reports.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : weekReportCount === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-outline-variant px-4 text-center text-sm text-on-surface-variant">
                {t('parent.reports.noWeekReports')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={chart.margin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_STROKE} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} {...chart.xAxis} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} {...chart.yAxis} />
                  <Tooltip cursor={CHART_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="reports" name={t('parent.reports.title')} fill={chartColor('primary')} radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-on-surface">
            {t('parent.reports.moodBreakdown', { defaultValue: 'Mood breakdown' })}
          </h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {t('parent.reports.moodBreakdownSubtitle', { defaultValue: 'Mood labels from published reports.' })}
          </p>
          {moodRows.length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-center xl:grid-cols-1">
              <div className="relative mx-auto h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={moodRows} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={moodRows.length > 1 ? 3 : 0} stroke="none">
                      {moodRows.map((row, index) => (
                        <Cell key={row.name} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums text-on-surface">{moodTotal}</span>
                  <span className="text-xs text-on-surface-variant">{t('parent.reports.title')}</span>
                </span>
              </div>
              <ul className="space-y-2">
                {moodRows.map((row, index) => (
                  <li key={row.name} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-lowest px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-on-surface">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_SERIES[index % CHART_SERIES.length] }} aria-hidden />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-on-surface">
                      {row.value}
                      <span className="ms-1 text-xs font-medium text-on-surface-variant">({Math.round((row.value / moodTotal) * 100)}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 flex h-44 items-center justify-center rounded-lg border border-dashed border-outline-variant px-4 text-center text-sm text-on-surface-variant">
              {t('parent.reports.noMoodData', { defaultValue: 'Mood chart appears after reports are published.' })}
            </div>
          )}
        </div>
      </section>

      <TableCard
        title={t('parent.reports.listTitle', { defaultValue: 'Report timeline' })}
        count={reports.isLoading ? undefined : t('parent.reports.resultsCount', { count: reports.reports.length })}
        actions={
          latestReport ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <MaterialSymbol name="school" size="text-sm" />
              {t('parent.reports.latestFrom', { defaultValue: 'Latest from {{teacher}}', teacher: latestReport.teacherName })}
            </span>
          ) : null
        }
        pagination={reports.isLoading || !reports.reports.length ? null : <TablePagination pager={pager} pageSizeOptions={[6, 12, 24]} />}
      >
        {reports.isLoading ? (
          <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : !reports.reports.length ? (
          <TableEmpty icon="description" title={t('parent.reports.emptyTitle')} description={t('parent.reports.emptyDescription')} />
        ) : (
          <div className="divide-y divide-outline-variant">
            {reportGroups.map((group) => (
              <section key={group.key} className="space-y-3 p-4 sm:p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MaterialSymbol name="calendar_today" size="text-sm" />
                  </span>
                  {dayHeading(group.key, i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB', { today: t('common.today'), yesterday: t('common.yesterday') })}
                  <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">{group.items.length}</span>
                </h3>
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {group.items.map((report) => (
                    <ReportCard key={report.id} report={report} locale={i18n.language} onOpen={openReport} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </TableCard>

      <ParentReportDetailModal
        open={Boolean(activeReport)}
        report={activeReport}
        reaction={activeReport ? reports.reactions.find((reaction) => reaction.report_id === activeReport.id) : undefined}
        onOpenChange={(open) => {
          if (!open) closeReport();
        }}
        onPrev={() => {
          if (activeIndex > 0) openReport(reports.reports[activeIndex - 1]);
        }}
        onNext={() => {
          if (activeIndex >= 0 && activeIndex < reports.reports.length - 1) openReport(reports.reports[activeIndex + 1]);
        }}
        onReact={(payload) => (activeReport ? reports.saveReaction({ reportId: activeReport.id, ...payload }) : Promise.resolve())}
      />
    </div>
  );
}
