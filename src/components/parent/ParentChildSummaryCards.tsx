import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParentDashboardChildCard } from '@/hooks/useParentDashboardChildren';
import { cn, getUserInitials } from '@/lib/utils';

type ChildInsight = {
  outstanding: number;
  latestInvoiceNumber?: string;
  latestInvoiceStatus?: string;
  absentDays: number;
  attendanceRate: number;
  attendanceCalendar: Array<{ date: string; status: 'present' | 'absent' | 'off' }>;
  relatedUpdate?: { label: string; to: string };
};

type Props = {
  children: ParentDashboardChildCard[];
  unreadTotal: number;
  isLoading: boolean;
  totalOutstanding?: number;
  upcomingEventsCount?: number;
  childInsights?: Record<string, ChildInsight>;
};

function formatClock(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function formatShortDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
  }).format(d);
}

function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'error';
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-2 sm:px-3">
      <p className="truncate text-[10px] font-semibold uppercase text-on-surface-variant sm:text-[11px]">{label}</p>
      <p
        className={cn(
          'mt-1 text-base font-bold sm:text-lg',
          tone === 'success' && 'text-success',
          tone === 'error' && 'text-error',
          tone === 'default' && 'text-on-surface',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ParentChildSummaryCards({
  children: rows,
  unreadTotal,
  isLoading,
  totalOutstanding,
  upcomingEventsCount,
  childInsights = {},
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-6 text-center text-sm text-on-surface-variant">
        {t('parent.dashboard.noChildren')}
      </p>
    );
  }

  const checkedInCount = rows.filter((c) => c.attendanceLabel === 'checked_in' || c.attendanceLabel === 'checked_out').length;

  return (
    <div className="space-y-3">
      {rows.length > 1 ? (
        <div className="flex flex-wrap gap-3 rounded-xl border border-outline-variant bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-lg text-success" aria-hidden>how_to_reg</span>
            {t('parent.dashboard.totals.checkedIn', { count: checkedInCount, total: rows.length })}
          </div>
          {totalOutstanding != null && totalOutstanding > 0 ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-lg text-error" aria-hidden>payments</span>
              {t('parent.dashboard.totals.outstanding', { amount: totalOutstanding.toFixed(2) })}
            </div>
          ) : null}
          {upcomingEventsCount != null && upcomingEventsCount > 0 ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-lg text-primary" aria-hidden>event</span>
              {t('parent.dashboard.totals.upcomingEvents', { count: upcomingEventsCount })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
        {rows.map((child) => {
          const name = locale === 'ar' ? child.nameAr : child.nameEn;
          const initials = getUserInitials(name, '');
          const insight = childInsights[child.id];
          const hasOutstanding = (insight?.outstanding ?? 0) > 0;
          const week = (insight?.attendanceCalendar ?? []).slice(-7).filter((day) => day.status !== 'off');
          const weeklyPresent = week.filter((day) => day.status === 'present').length;
          const weeklyAbsent = week.filter((day) => day.status === 'absent').length;
          const weeklyTotal = weeklyPresent + weeklyAbsent;
          const weeklyRate = weeklyTotal > 0 ? Math.round((weeklyPresent / weeklyTotal) * 100) : 0;

          let attendanceText = t('parent.dashboard.child.attendanceAbsent');
          let attendanceIcon = 'event_busy';
          let attendanceTone = 'border-error/30 bg-error/10 text-error';
          if (child.attendanceLabel === 'checked_in') {
            attendanceText = t('parent.dashboard.child.attendanceIn', { time: formatClock(child.checkIn, locale) });
            attendanceIcon = 'login';
            attendanceTone = 'border-success/30 bg-success/10 text-success';
          } else if (child.attendanceLabel === 'checked_out') {
            attendanceText = t('parent.dashboard.child.attendanceOut', {
              in: formatClock(child.checkIn, locale),
              out: formatClock(child.checkOut, locale),
            });
            attendanceIcon = 'task_alt';
            attendanceTone = 'border-primary/30 bg-primary/10 text-primary';
          }

          const moodLine = child.lastReportMood
            ? t('parent.dashboard.child.mood', { mood: child.lastReportMood })
            : t('parent.dashboard.child.noMood');
          const mealsLine = child.lastReportMeals
            ? t('parent.dashboard.child.meals', { summary: child.lastReportMeals })
            : t('parent.dashboard.child.noMeals');

          return (
            <article
              key={child.id}
              className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm transition hover:border-primary/40 hover:shadow-md sm:min-h-[460px] sm:rounded-xl"
            >
              <div className="border-b border-outline-variant bg-surface-container-lowest p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 shrink-0 border border-outline-variant sm:h-14 sm:w-14">
                    <AvatarImage src={child.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/parent/child/${child.id}/qr`} className="min-w-0 hover:text-primary">
                        <p className="truncate text-sm font-semibold text-on-surface sm:text-base">{name}</p>
                      </Link>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                          hasOutstanding ? 'bg-error/10 text-error' : 'bg-success/10 text-success',
                        )}
                      >
                        {hasOutstanding
                          ? t('parent.dashboard.child.paymentDue', { defaultValue: 'Payment due' })
                          : t('invoice.status.paid', { defaultValue: 'Paid' })}
                      </span>
                    </div>
                    <div className={cn('mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', attendanceTone)}>
                      <span className="material-symbols-outlined text-sm" aria-hidden>{attendanceIcon}</span>
                      <span className="truncate">{attendanceText}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label={t('parent.dashboard.analytics.present', { defaultValue: 'Present' })} value={weeklyPresent} tone="success" />
                  <MiniStat label={t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })} value={weeklyAbsent} tone="error" />
                  <MiniStat label={t('parent.dashboard.analytics.weekTitle', { defaultValue: 'This week' })} value={`${weeklyRate}%`} />
                </div>

                <div className="mt-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 sm:mt-4 sm:rounded-lg">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase text-on-surface-variant">
                      {t('parent.dashboard.analytics.openAttendance', { defaultValue: 'Attendance details' })}
                    </p>
                    <p className="text-xs font-semibold text-primary">{insight?.attendanceRate ?? 0}% / 30d</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                    <div className="h-full rounded-full bg-success" style={{ width: `${weeklyRate}%` }} />
                  </div>
                  {insight?.attendanceCalendar?.length ? (
                    <div className="mt-3 grid grid-cols-7 gap-1">
                      {insight.attendanceCalendar.slice(-7).map((day) => (
                        <span
                          key={day.date}
                          className={cn(
                            'flex h-7 items-center justify-center rounded-md border text-[10px] font-semibold sm:h-8',
                            day.status === 'present' && 'border-success/30 bg-success/10 text-success',
                            day.status === 'absent' && 'border-error/30 bg-error/10 text-error',
                            day.status === 'off' && 'border-outline-variant bg-surface text-on-surface-variant',
                          )}
                          title={`${day.date}: ${day.status}`}
                        >
                          {formatShortDate(day.date, locale).slice(0, 2)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-medium text-on-surface-variant">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-success" /> {t('parent.dashboard.analytics.present', { defaultValue: 'Present' })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-error" /> {t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}
                    </span>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                  <p className="line-clamp-1 text-xs font-semibold text-on-surface">{moodLine}</p>
                  <p className="line-clamp-1 text-xs text-on-surface-variant">{mealsLine}</p>
                  {insight?.relatedUpdate ? (
                    <Link to={insight.relatedUpdate.to} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <span className="material-symbols-outlined text-sm" aria-hidden>description</span>
                      {insight.relatedUpdate.label}
                    </Link>
                  ) : unreadTotal > 0 ? (
                    <Link to="/parent/notifications" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <span className="material-symbols-outlined text-sm" aria-hidden>notifications</span>
                      {t('parent.dashboard.child.unreadBadge', { count: unreadTotal })}
                    </Link>
                  ) : (
                    <p className="mt-2 text-[11px] text-on-surface-variant">{t('parent.dashboard.child.noUnread')}</p>
                  )}
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-3 sm:grid-cols-3">
                  <Link
                    to={`/parent/attendance?child=${child.id}`}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-primary/10 px-2 text-xs font-semibold text-primary transition hover:bg-primary/15"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden>history</span>
                    {t('parent.dashboard.analytics.openAttendance', { defaultValue: 'Attendance details' })}
                  </Link>
                  <Link
                    to={`/parent/daily-reports?child=${child.id}`}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-primary/10 px-2 text-xs font-semibold text-primary transition hover:bg-primary/15"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden>description</span>
                    {t('parent.dashboard.analytics.openReports', { defaultValue: 'Open reports' })}
                  </Link>
                  <Link
                    to="/parent/messages"
                    className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-surface-container px-2 text-xs font-semibold text-on-surface transition hover:bg-surface-high sm:col-span-1"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden>forum</span>
                    {t('parent.dashboard.child.messageNursery', { defaultValue: 'Message nursery' })}
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
