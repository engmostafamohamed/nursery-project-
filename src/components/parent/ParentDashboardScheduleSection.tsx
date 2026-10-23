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

/** 'HH:MM[:SS]' as a clock time in the current language ("6:00 pm" / "٦:٠٠ م"). */
function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  return formatTime(new Date(2000, 0, 1, h, m), { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function ParentDashboardScheduleSection({ todayEvents, upcoming, pickup, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const locale = isAr ? 'ar-EG' : 'en-GB';

  if (isLoading) {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }

  const pickupTime = pickup.standardEndTime ?? pickup.nurseryClosesAt;
  const pickupLine = pickupTime ? t('parent.dashboard.schedule.pickupLine', { time: clockLabel(pickupTime) }) : t('parent.dashboard.schedule.pickupFallback');

  const eventRow = (id: string, title: string, startsAt: string, showDay: boolean) => {
    const date = new Date(startsAt);
    return (
      <li key={id}>
        <Link
          to={`/parent/events/${id}`}
          className="group flex items-center gap-3 rounded-lg border border-outline-variant bg-surface px-3 py-2.5 transition hover:border-primary/40 hover:bg-primary/5"
        >
          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
            <span className="text-[10px] font-semibold uppercase leading-none">{date.toLocaleDateString(locale, { month: 'short' })}</span>
            <span className="text-base font-bold leading-tight tabular-nums">{date.toLocaleDateString(locale, { day: 'numeric' })}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-on-surface">{title}</span>
            <span className="block text-xs text-on-surface-variant">
              {showDay
                ? date.toLocaleString(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
                : formatTime(startsAt, { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          </span>
          <span className="material-symbols-outlined shrink-0 text-on-surface-variant transition group-hover:text-primary rtl:rotate-180" aria-hidden>
            chevron_right
          </span>
        </Link>
      </li>
    );
  };

  return (
    <section className="space-y-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3 rounded-lg border-s-4 border-primary/40 bg-primary/5 px-3 py-2.5 text-sm text-on-surface">
        <span className="material-symbols-outlined shrink-0 text-lg text-primary" aria-hidden>
          schedule
        </span>
        {pickupLine}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">{t('parent.dashboard.schedule.today')}</h3>
        {todayEvents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant px-3 py-3 text-sm text-on-surface-variant">{t('parent.dashboard.schedule.noToday')}</p>
        ) : (
          <ul className="space-y-2">{todayEvents.map((e) => eventRow(e.id, isAr ? e.titleAr : e.titleEn, e.startsAt, false))}</ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">{t('parent.dashboard.schedule.upcoming')}</h3>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant px-3 py-3 text-sm text-on-surface-variant">{t('parent.dashboard.schedule.noUpcoming')}</p>
        ) : (
          <ul className="space-y-2">{upcoming.map((e) => eventRow(e.id, isAr ? e.titleAr : e.titleEn, e.startsAt, true))}</ul>
        )}
      </div>

      <Link to="/parent/events" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        {t('parent.dashboard.schedule.allEvents')}
        <span className="material-symbols-outlined text-base rtl:rotate-180" aria-hidden>
          arrow_forward
        </span>
      </Link>
    </section>
  );
}
