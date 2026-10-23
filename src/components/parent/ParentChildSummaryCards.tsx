import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusPill, type PillTone } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParentDashboardChildCard } from '@/hooks/useParentDashboardChildren';
import { formatMoodLabel, moodKey } from '@/lib/dailyReportDisplay';
import { formatMoneyAmount } from '@/lib/money';
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

const MOOD_ICON: Record<ReturnType<typeof moodKey>, { icon: string; tile: string }> = {
  happy: { icon: 'sentiment_very_satisfied', tile: 'bg-success/10 text-success' },
  content: { icon: 'sentiment_satisfied', tile: 'bg-primary/10 text-primary' },
  fussy: { icon: 'sentiment_dissatisfied', tile: 'bg-warning/10 text-warning' },
  cranky: { icon: 'sentiment_very_dissatisfied', tile: 'bg-error/10 text-error' },
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

function weekdayShort(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short' }).format(d);
}

/** A week's rate as a colour: no school days yet stays neutral. */
function rateTone(rate: number, schoolDays: number): string {
  if (schoolDays === 0) return 'text-on-surface-variant';
  if (rate >= 80) return 'text-success';
  if (rate >= 50) return 'text-warning';
  return 'text-error';
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface px-4 py-8 text-center text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-3xl" aria-hidden>child_care</span>
        {t('parent.dashboard.noChildren')}
      </p>
    );
  }

  const checkedInCount = rows.filter((c) => c.attendanceLabel === 'checked_in' || c.attendanceLabel === 'checked_out').length;

  return (
    <div className="space-y-3">
      {rows.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="success" icon="how_to_reg">
            {t('parent.dashboard.totals.checkedIn', { count: checkedInCount, total: rows.length })}
          </StatusPill>
          {totalOutstanding != null && totalOutstanding > 0 ? (
            <StatusPill tone="error" icon="payments">
              {t('parent.dashboard.totals.outstanding', { amount: formatMoneyAmount(totalOutstanding) })}
            </StatusPill>
          ) : null}
          {upcomingEventsCount != null && upcomingEventsCount > 0 ? (
            <StatusPill tone="primary" icon="event">
              {t('parent.dashboard.totals.upcomingEvents', { count: upcomingEventsCount })}
            </StatusPill>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((child) => {
          const name = (locale === 'ar' ? child.nameAr || child.nameEn : child.nameEn || child.nameAr) || '-';
          const initials = getUserInitials(name, '');
          const insight = childInsights[child.id];
          const hasOutstanding = (insight?.outstanding ?? 0) > 0;
          const days = (insight?.attendanceCalendar ?? []).slice(-7);
          const schoolDays = days.filter((day) => day.status !== 'off');
          const weeklyPresent = schoolDays.filter((day) => day.status === 'present').length;
          const weeklyAbsent = schoolDays.filter((day) => day.status === 'absent').length;
          const weeklyRate = schoolDays.length > 0 ? Math.round((weeklyPresent / schoolDays.length) * 100) : 0;

          let attendanceText = t('parent.dashboard.child.attendanceAbsent');
          let attendanceIcon = 'event_busy';
          let attendanceTone: PillTone = 'error';
          if (child.attendanceLabel === 'checked_in') {
            attendanceText = t('parent.dashboard.child.attendanceIn', { time: formatClock(child.checkIn, locale) });
            attendanceIcon = 'login';
            attendanceTone = 'success';
          } else if (child.attendanceLabel === 'off') {
            attendanceText = t('attendance.offDayTitle');
            attendanceIcon = 'weekend';
            attendanceTone = 'neutral';
          } else if (child.attendanceLabel === 'checked_out') {
            attendanceText = t('parent.dashboard.child.attendanceOut', {
              in: formatClock(child.checkIn, locale),
              out: formatClock(child.checkOut, locale),
            });
            attendanceIcon = 'task_alt';
            attendanceTone = 'primary';
          }

          const mood = child.lastReportMood ? MOOD_ICON[moodKey(child.lastReportMood)] : null;

          return (
            <article
              key={child.id}
              className="flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <header className="p-4 pb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 shrink-0 bg-primary/10">
                    <AvatarImage src={child.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-sm text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <Link
                    to={`/parent/child/${child.id}/qr`}
                    className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug text-on-surface hover:text-primary"
                    title={name}
                  >
                    {name}
                  </Link>
                </div>
                {/* Today's attendance and the payment state on their own row, so neither is cut off. */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StatusPill tone={attendanceTone} icon={attendanceIcon}>{attendanceText}</StatusPill>
                  <StatusPill tone={hasOutstanding ? 'error' : 'success'} icon={hasOutstanding ? 'payments' : 'task_alt'}>
                    {hasOutstanding ? t('parent.dashboard.child.paymentDue') : t('invoice.status.paid')}
                  </StatusPill>
                </div>
              </header>

              <div className="mx-4 rounded-lg bg-surface-container-lowest p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-on-surface-variant">{t('parent.dashboard.analytics.weekTitle', { defaultValue: 'This week' })}</p>
                  <p className={cn('text-lg font-bold tabular-nums', rateTone(weeklyRate, schoolDays.length))}>
                    {schoolDays.length ? `${weeklyRate}%` : '—'}
                  </p>
                </div>
                {days.length ? (
                  <ol className="mt-2 grid grid-cols-7 gap-1">
                    {days.map((day) => (
                      <li key={day.date} className="flex flex-col items-center gap-1" title={`${day.date}: ${t(`parent.dashboard.child.day.${day.status}`)}`}>
                        <span className="text-[10px] font-medium text-on-surface-variant">{weekdayShort(day.date, locale)}</span>
                        <span
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full',
                            day.status === 'present' && 'bg-success text-on-primary',
                            day.status === 'absent' && 'bg-error text-on-primary',
                            day.status === 'off' && 'border border-dashed border-outline-variant text-on-surface-variant',
                          )}
                          aria-hidden
                        >
                          {day.status === 'off' ? null : (
                            <span className="material-symbols-outlined text-sm">{day.status === 'present' ? 'check' : 'close'}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                    {t('parent.dashboard.child.presentCount', { count: weeklyPresent })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-error" aria-hidden />
                    {t('parent.dashboard.child.absentCount', { count: weeklyAbsent })}
                  </span>
                  <span className="ms-auto font-semibold tabular-nums text-on-surface">
                    {t('parent.dashboard.child.monthRate', { rate: insight?.attendanceRate ?? 0 })}
                  </span>
                </div>
              </div>

              <div className="mx-4 mb-4 mt-3 flex items-start gap-3">
                <span
                  className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', mood ? mood.tile : 'bg-surface-high text-on-surface-variant')}
                  aria-hidden
                >
                  <span className="material-symbols-outlined text-xl">{mood ? mood.icon : 'description'}</span>
                </span>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-semibold text-on-surface">
                    {child.lastReportMood
                      ? t('parent.dashboard.child.mood', { mood: formatMoodLabel(t, child.lastReportMood) })
                      : t('parent.dashboard.child.noMood')}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-on-surface-variant">
                    {child.lastReportMeals ? t('parent.dashboard.child.meals', { summary: child.lastReportMeals }) : t('parent.dashboard.child.noMeals')}
                  </p>
                  {insight?.relatedUpdate ? (
                    <Link to={insight.relatedUpdate.to} className="mt-1 line-clamp-1 font-semibold text-primary hover:underline">
                      {insight.relatedUpdate.label}
                    </Link>
                  ) : unreadTotal > 0 ? (
                    <Link to="/parent/notifications" className="mt-1 inline-block font-semibold text-primary hover:underline">
                      {t('parent.dashboard.child.unreadBadge', { count: unreadTotal })}
                    </Link>
                  ) : null}
                </div>
              </div>

              {/* Icon above a short label, so all three fit one row even on a phone. */}
              <div className="mt-auto grid grid-cols-3 gap-1 border-t border-outline-variant p-2">
                {[
                  { to: `/parent/attendance?child=${child.id}`, icon: 'history', label: t('parent.dashboard.analytics.openAttendance', { defaultValue: 'Attendance details' }) },
                  { to: `/parent/daily-reports?child=${child.id}`, icon: 'description', label: t('parent.dashboard.analytics.openReports', { defaultValue: 'Open reports' }) },
                  { to: '/parent/messages', icon: 'forum', label: t('parent.dashboard.child.messageNursery') },
                ].map((action) => (
                  <Link
                    key={action.icon}
                    to={action.to}
                    className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center text-[11px] font-semibold leading-tight text-on-surface-variant transition hover:bg-primary/5 hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-xl text-primary" aria-hidden>{action.icon}</span>
                    {action.label}
                  </Link>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
