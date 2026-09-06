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
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useParentReports, type ParentReportItem } from '@/hooks/useParentReports';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  formatActivityTag,
  formatMealSlot,
  formatMoodLabel,
  formatNapQuality,
} from '@/lib/dailyReportDisplay';
import { formatDateTime } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const MOOD_COLORS = ['#5b5fd6', '#22a879', '#d98613', '#df477f', '#64748b'];

function formatDateLabel(value: string, locale: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}

function reportSummary(t: ReturnType<typeof useTranslation>['t'], report: ParentReportItem) {
  const tags = (
    (report.activities.tags as string[] | undefined) ??
    (report.activities.participated_in as string[] | undefined) ??
    []
  )
    .slice(0, 2)
    .map((tag) => formatActivityTag(t, tag));
  const napMinutes = Number(report.nap.duration_minutes ?? 0);
  const parts = [
    formatMoodLabel(t, report.mood.mood),
    formatMealSlot(t, report.meals.lunch as Record<string, unknown> | undefined),
    napMinutes ? `${napMinutes} ${t('parent.reports.minutes')}` : formatNapQuality(t, report.nap.quality),
    ...tags,
  ].filter(Boolean);
  return parts.join(' • ');
}

function StatCard({
  icon,
  label,
  value,
  tone = 'primary',
  helper,
}: {
  icon: string;
  label: string;
  value: string | number;
  tone?: 'primary' | 'green' | 'amber' | 'pink';
  helper?: string;
}) {
  const toneClass = {
    primary: 'bg-primary text-on-primary',
    green: 'bg-[#22a879] text-white',
    amber: 'bg-[#d98613] text-white',
    pink: 'bg-[#df477f] text-white',
  }[tone];

  return (
    <div className="flex min-h-[104px] items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm', toneClass)}>
        <MaterialSymbol name={icon} size="text-xl" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-on-surface-variant">{label}</p>
        <p className="mt-1 text-2xl font-bold text-on-surface">{value}</p>
        {helper ? <p className="mt-1 truncate text-xs text-on-surface-variant">{helper}</p> : null}
      </div>
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
  const summary = reportSummary(t, report);
  const notes = report.specialNotes?.trim();

  return (
    <article className="group overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <button type="button" className="block w-full p-4 text-left" onClick={() => onOpen(report)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary">
              <MaterialSymbol name="assignment" size="text-xl" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-on-surface">{report.childName}</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {formatDateLabel(report.reportDate, locale)} • {report.teacherName}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-semibold text-secondary">
            {mood}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-container px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">{t('parent.reports.sections.meals')}</p>
            <p className="mt-1 truncate text-sm font-semibold text-on-surface">
              {formatMealSlot(t, report.meals.lunch as Record<string, unknown> | undefined)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">{t('parent.reports.sections.nap')}</p>
            <p className="mt-1 truncate text-sm font-semibold text-on-surface">
              {Number(report.nap.duration_minutes ?? 0)
                ? `${Number(report.nap.duration_minutes)} ${t('parent.reports.minutes')}`
                : formatNapQuality(t, report.nap.quality)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
              {t('parent.reports.sections.activities')}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-on-surface">
              {(
                (report.activities.tags as string[] | undefined) ??
                (report.activities.participated_in as string[] | undefined) ??
                []
              )
                .slice(0, 1)
                .map((tag) => formatActivityTag(t, tag))
                .join(', ') || '-'}
            </p>
          </div>
        </div>

        <p className="mt-4 line-clamp-2 text-sm text-on-surface-variant">{notes || summary}</p>
        <div className="mt-4 flex items-center justify-between border-t border-outline-variant pt-3">
          <p className="text-xs text-on-surface-variant">
            {report.publishedAt ? formatDateTime(report.publishedAt) : formatDateLabel(report.reportDate, locale)}
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            {t('parent.reports.viewFull')}
            <MaterialSymbol name="chevron_right" size="text-base" className="transition group-hover:translate-x-0.5" />
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

  const latestReport = reports.reports[0];
  const uniqueChildrenWithReports = new Set(reports.reports.map((report) => report.childId)).size;
  const pager = usePagination(reports.reports, 6, `${childId}|${fromDate}|${toDate}|${sort}|${reports.reports.length}`);

  return (
    <div className="w-full max-w-none space-y-6 pb-28">
      <section className="overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-low p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/20">
              <MaterialSymbol name="assignment" size="text-2xl" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {t('parent.reports.eyebrow', { defaultValue: 'Daily updates' })}
              </p>
              <h1 className="truncate text-2xl font-bold text-on-surface">{t('parent.reports.title')}</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                {t('parent.reports.subtitle', {
                  defaultValue: 'Meals, naps, mood, activities, and teacher notes in one place.',
                })}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3">
            <p className="text-xs font-semibold uppercase text-on-surface-variant">
              {t('parent.reports.stats.lastReport')}
            </p>
            <p className="mt-1 text-sm font-bold text-on-surface">
              {latestReport ? formatDateLabel(latestReport.reportDate, i18n.language) : '-'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon="calendar_month"
            label={t('parent.reports.stats.thisWeek')}
            value={reports.stats.thisWeek}
            helper={t('parent.reports.last7Days', { defaultValue: 'Last 7 days' })}
          />
          <StatCard
            icon="event_note"
            label={t('parent.reports.stats.thisMonth')}
            value={reports.stats.thisMonth}
            tone="green"
            helper={t('parent.reports.currentMonth', { defaultValue: 'Current month' })}
          />
          <StatCard
            icon="notifications"
            label={t('parent.dashboard.unread', { defaultValue: 'Unread' })}
            value={reports.unreadCount}
            tone="amber"
            helper={t('parent.reports.newUpdates', { defaultValue: 'New published reports' })}
          />
          <StatCard
            icon="child_care"
            label={t('parent.reports.childrenCovered', { defaultValue: 'Children covered' })}
            value={uniqueChildrenWithReports || reports.children.length}
            tone="pink"
            helper={latestReport?.childName ?? t('parent.reports.allChildren')}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.75fr)]">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-on-surface-variant">
              {t('common.child', { defaultValue: 'Child' })}
            </span>
            <Select value={childId} onChange={(event) => setChildId(event.target.value)}>
              <option value="">{t('parent.reports.allChildren')}</option>
              {reports.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-on-surface-variant">
              {t('common.fromDate', { defaultValue: 'From date' })}
            </span>
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-on-surface-variant">
              {t('common.toDate', { defaultValue: 'To date' })}
            </span>
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-on-surface-variant">{t('common.sort', { defaultValue: 'Sort' })}</span>
            <Select value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'oldest')}>
              <option value="newest">{t('parent.reports.sortNewest')}</option>
              <option value="oldest">{t('parent.reports.sortOldest')}</option>
            </Select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.8fr)]">
        <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-on-surface">
                {t('parent.reports.trendTitle', { defaultValue: 'Report activity' })}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {t('parent.reports.trendSubtitle', { defaultValue: 'Published daily reports across the last week.' })}
              </p>
            </div>
          </div>
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--outline-variant))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--surface-container))' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--outline-variant))' }}
                />
                <Bar dataKey="reports" fill="#5b5fd6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="text-lg font-bold text-on-surface">
            {t('parent.reports.moodBreakdown', { defaultValue: 'Mood breakdown' })}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {t('parent.reports.moodBreakdownSubtitle', { defaultValue: 'Mood labels from published reports.' })}
          </p>
          {moodRows.length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-1">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={moodRows} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={3}>
                      {moodRows.map((row, index) => (
                        <Cell key={row.name} fill={MOOD_COLORS[index % MOOD_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--outline-variant))' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {moodRows.map((row, index) => (
                  <div key={row.name} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-on-surface">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MOOD_COLORS[index % MOOD_COLORS.length] }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="text-sm font-bold text-on-surface">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex h-44 items-center justify-center rounded-2xl bg-surface-container text-sm text-on-surface-variant">
              {t('parent.reports.noMoodData', { defaultValue: 'Mood chart appears after reports are published.' })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-on-surface">
              {t('parent.reports.listTitle', { defaultValue: 'Report timeline' })}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {t('common.paginationSummary', {
                start: pager.startIndex,
                end: pager.endIndex,
                total: pager.total,
              })}
            </p>
          </div>
          {latestReport ? (
            <p className="rounded-full bg-primary-container px-3 py-1 text-xs font-semibold text-primary">
              {t('parent.reports.latestFrom', {
                defaultValue: 'Latest from {{teacher}}',
                teacher: latestReport.teacherName,
              })}
            </p>
          ) : null}
        </div>

        {reports.isLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : !reports.reports.length ? (
          <EmptyState
            icon="description"
            title={t('parent.reports.emptyTitle')}
            description={t('parent.reports.emptyDescription')}
          />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {pager.pageItems.map((report) => (
                <ReportCard key={report.id} report={report} locale={i18n.language} onOpen={openReport} />
              ))}
            </div>
            <Pagination
              className="mt-5"
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
          </>
        )}
      </section>

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
