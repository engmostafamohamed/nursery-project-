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
        <div className="flex flex-wrap gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {rows.map((c) => {
        const name = locale === 'ar' ? c.nameAr : c.nameEn;
        const initials = getUserInitials(name, '');
        const detailHref = `/parent/child/${c.id}/qr`;

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
          <Link
            key={c.id}
            to={detailHref}
            className="block rounded-3xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm transition-colors hover:border-primary"
          >
            <div className="flex gap-3">
              <Avatar className="h-14 w-14 shrink-0 border border-outline-variant">
                <AvatarImage src={c.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-sm">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-on-surface">{name}</p>
                <p className="mt-1 text-xs text-on-surface-variant">{attendanceText}</p>
                <p className="mt-2 line-clamp-2 text-xs text-on-surface-variant">{moodLine}</p>
                <p className="line-clamp-2 text-xs text-on-surface-variant">{mealsLine}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {unreadTotal > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-medium text-primary">
                      <span className="material-symbols-outlined text-[14px]" aria-hidden>
                        notifications
                      </span>
                      {t('parent.dashboard.child.unreadBadge', { count: unreadTotal })}
                    </span>
                  ) : (
                    <span className="text-[11px] text-on-surface-variant">{t('parent.dashboard.child.noUnread')}</span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
      </div>
    </div>
  );
}
