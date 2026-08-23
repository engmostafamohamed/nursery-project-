import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { formatTime } from '@/lib/datetime';
import type { ParentPickupReminder, ParentScheduleTodayEvent, ParentScheduleUpcoming } from '@/hooks/useParentDashboardSchedule';

type Props = {
  todayEvents: ParentScheduleTodayEvent[];
  upcoming: ParentScheduleUpcoming[];
  pickup: ParentPickupReminder;
  isLoading: boolean;
};

export function ParentDashboardScheduleSection({ todayEvents, upcoming, pickup, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (isLoading) {
    return (
      <section className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm">
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }

  const pickupLine =
    pickup.standardEndTime || pickup.nurseryClosesAt
      ? t('parent.dashboard.schedule.pickupLine', {
          time: pickup.standardEndTime ?? pickup.nurseryClosesAt ?? '',
        })
      : t('parent.dashboard.schedule.pickupFallback');

  return (
    <section className="space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        <span className="material-symbols-outlined align-middle text-base text-warning" aria-hidden>
          schedule
        </span>{' '}
        {pickupLine}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-on-surface-variant">{t('parent.dashboard.schedule.today')}</h3>
        {todayEvents.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('parent.dashboard.schedule.noToday')}</p>
        ) : (
          <ul className="space-y-2">
            {todayEvents.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/parent/events/${e.id}`}
                  className="flex items-start justify-between gap-2 rounded-xl border border-outline-variant bg-surface text-foreground px-3 py-2 text-sm hover:bg-surface-container"
                >
                  <span className="font-medium text-on-surface">
                    {locale === 'ar' ? e.titleAr : e.titleEn}
                  </span>
                  <span className="shrink-0 text-on-surface-variant">{formatTime(e.startsAt, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-on-surface-variant">{t('parent.dashboard.schedule.upcoming')}</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('parent.dashboard.schedule.noUpcoming')}</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/parent/events/${e.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-outline-variant bg-surface text-foreground px-3 py-2 text-sm hover:bg-surface-container"
                >
                  <span className="font-medium text-on-surface">
                    {locale === 'ar' ? e.titleAr : e.titleEn}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit', hour12: true,
                    }).format(new Date(e.startsAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/parent/events" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        {t('parent.dashboard.schedule.allEvents')}
        <span className="material-symbols-outlined text-base rtl:rotate-180" aria-hidden>
          arrow_forward
        </span>
      </Link>
    </section>
  );
}
