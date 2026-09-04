import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParentDashboardChildCard } from '@/hooks/useParentDashboardChildren';
import { getUserInitials } from '@/lib/utils';

type Props = {
  children: ParentDashboardChildCard[];
  unreadTotal: number;
  isLoading: boolean;
  totalOutstanding?: number;
  upcomingEventsCount?: number;
  childInsights?: Record<
    string,
    {
      outstanding: number;
      latestInvoiceNumber?: string;
      latestInvoiceStatus?: string;
      absentDays: number;
      attendanceRate: number;
      attendanceCalendar: Array<{ date: string; status: 'present' | 'absent' | 'off' }>;
      relatedUpdate?: { label: string; to: string };
    }
  >;
};

function formatClock(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit', hour12: true,
  }).format(d);
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-6 text-center text-sm text-on-surface-variant">
        {t('parent.dashboard.noChildren')}
      </p>
    );
  }

  const checkedInCount = rows.filter((c) => c.attendanceLabel === 'checked_in' || c.attendanceLabel === 'checked_out').length;

  return (
    <div className="space-y-3">
      {rows.length > 1 ? (
        <div className="flex flex-wrap gap-3 rounded-2xl border border-outline-variant bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-lg text-primary" aria-hidden>check_circle</span>
            {t('parent.dashboard.totals.checkedIn', { count: checkedInCount, total: rows.length })}
          </div>
          {totalOutstanding != null && totalOutstanding > 0 ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-lg text-primary" aria-hidden>payments</span>
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
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
      {rows.map((c) => {
        const name = locale === 'ar' ? c.nameAr : c.nameEn;
        const initials = getUserInitials(name, '');
        const detailHref = `/parent/child/${c.id}/qr`;
        const insight = childInsights[c.id];
        const hasOutstanding = (insight?.outstanding ?? 0) > 0;

        let attendanceText = t('parent.dashboard.child.attendanceAbsent');
        if (c.attendanceLabel === 'checked_in') {
          attendanceText = t('parent.dashboard.child.attendanceIn', { time: formatClock(c.checkIn, locale) });
        } else if (c.attendanceLabel === 'checked_out') {
          attendanceText = t('parent.dashboard.child.attendanceOut', {
            in: formatClock(c.checkIn, locale),
            out: formatClock(c.checkOut, locale),
          });
        }

        const moodLine = c.lastReportMood
          ? t('parent.dashboard.child.mood', { mood: c.lastReportMood })
          : t('parent.dashboard.child.noMood');
        const mealsLine = c.lastReportMeals
          ? t('parent.dashboard.child.meals', { summary: c.lastReportMeals })
          : t('parent.dashboard.child.noMeals');

        return (
          <div
            key={c.id}
            className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex gap-3">
              <Avatar className="h-14 w-14 shrink-0 border border-outline-variant">
                <AvatarImage src={c.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-sm">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <Link to={detailHref} className="min-w-0 hover:text-primary">
                    <p className="truncate text-base font-semibold text-on-surface">{name}</p>
                  </Link>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    hasOutstanding ? 'bg-error/10 text-error' : 'bg-success/10 text-success'
                  }`}>
                    {hasOutstanding ? 'Payment due' : 'Paid'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">{attendanceText}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-[11px] font-semibold uppercase text-on-surface-variant">Absent</p>
                <p className="mt-1 text-lg font-bold text-on-surface">{insight?.absentDays ?? 0}</p>
              </div>
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-[11px] font-semibold uppercase text-on-surface-variant">Attendance</p>
                <p className="mt-1 text-lg font-bold text-on-surface">{insight?.attendanceRate ?? 0}%</p>
              </div>
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-[11px] font-semibold uppercase text-on-surface-variant">Previous pay</p>
                <p className={`mt-1 truncate text-sm font-bold ${hasOutstanding ? 'text-error' : 'text-success'}`}>
                  {hasOutstanding ? `EGP ${insight?.outstanding.toFixed(2)}` : 'Clear'}
                </p>
              </div>
            </div>

            {insight?.attendanceCalendar?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5" title="Recent attendance calendar">
                {insight.attendanceCalendar.map((day) => (
                  <span
                    key={day.date}
                    className={`h-3 w-3 rounded-full ${
                      day.status === 'present'
                        ? 'bg-success'
                        : day.status === 'absent'
                          ? 'bg-error'
                          : 'bg-outline-variant'
                    }`}
                    title={`${day.date}: ${day.status}`}
                  />
                ))}
              </div>
            ) : null}

            <div className="mt-3 rounded-xl bg-surface-container-lowest p-3">
              <p className="line-clamp-1 text-xs font-semibold text-on-surface">{moodLine}</p>
              <p className="line-clamp-1 text-xs text-on-surface-variant">{mealsLine}</p>
              {insight?.relatedUpdate ? (
                <Link to={insight.relatedUpdate.to} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  <span className="material-symbols-outlined text-sm" aria-hidden>notifications</span>
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

            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/parent/attendance?child=${c.id}`} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                Attendance
              </Link>
              <Link to={`/parent/invoices?child=${c.id}`} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                Payments
              </Link>
              <Link to="/parent/messages" className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                Message nursery
              </Link>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
