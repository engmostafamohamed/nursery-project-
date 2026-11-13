import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { StatusPill, type PillTone } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import type { AwaitingAnswer, FamilyAnswer } from '@/features/events/familyAnswers';
import type { ParentPickupReminder, ParentScheduleTodayEvent, ParentScheduleUpcoming } from '@/hooks/useParentDashboardSchedule';
import { localName } from '@/lib/bilingualName';
import { formatTime } from '@/lib/datetime';

type Props = {
  todayEvents: ParentScheduleTodayEvent[];
  upcoming: ParentScheduleUpcoming[];
  pickup: ParentPickupReminder;
  isLoading: boolean;
  /** Where each event stands for the family (by event id). */
  answers?: Record<string, FamilyAnswer>;
  /** The events still waiting for the family's answer, the soonest due first. */
  awaiting?: AwaitingAnswer[];
  /** A child's name, for "for Laila". */
  childName?: (childId: string) => string;
};

const ANSWER_PILL: Record<Exclude<FamilyAnswer, 'needsAnswer'>, { tone: PillTone; icon: string }> = {
  going: { tone: 'success', icon: 'task_alt' },
  notGoing: { tone: 'neutral', icon: 'block' },
};

/** 'HH:MM[:SS]' as a clock time in the current language ("6:00 pm" / "٦:٠٠ م"). */
function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  return formatTime(new Date(2000, 0, 1, h, m), { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * The family's day and week on its dashboard: the pickup time, the events still waiting for its
 * answer (the soonest due first), and today's and this week's events, each with where it stands
 * for the family (to answer, going, not going).
 */
export function ParentDashboardScheduleSection({ todayEvents, upcoming, pickup, isLoading, answers = {}, awaiting = [], childName }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const dueFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

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

  // An event waiting for the family's answer is shown once, in its own card above.
  const waiting = new Set(awaiting.map((a) => a.eventId));
  const today = todayEvents.filter((e) => !waiting.has(e.id));
  const week = upcoming.filter((e) => !waiting.has(e.id));

  const eventRow = (e: ParentScheduleTodayEvent, showDay: boolean) => {
    // Going or not going; one still to answer past its deadline shows nothing.
    const stand = answers[e.id];
    const answer = stand && stand !== 'needsAnswer' ? stand : undefined;
    return (
      <li key={e.id}>
        <Link
          to={`/parent/events/${e.id}`}
          className="group flex items-center gap-3 rounded-lg border border-outline-variant bg-surface px-3 py-2.5 transition hover:border-primary/40 hover:bg-primary/5"
          data-testid="dashboard-event"
        >
          <EventDateBlock startsAt={e.startsAt} category={e.category} locale={locale} className="h-12 w-11" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-on-surface">{localName(e.titleAr, e.titleEn, isAr)}</span>
            <span className="block text-xs text-on-surface-variant">
              {showDay
                ? new Date(e.startsAt).toLocaleString(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
                : formatTime(e.startsAt, { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          </span>
          {answer ? (
            <StatusPill tone={ANSWER_PILL[answer].tone} icon={ANSWER_PILL[answer].icon} className="hidden shrink-0 sm:inline-flex">
              {t(`parent.dashboard.schedule.answer.${answer}`)}
            </StatusPill>
          ) : null}
          <MaterialSymbol name="chevron_right" className="shrink-0 text-on-surface-variant transition group-hover:text-primary rtl:rotate-180" />
        </Link>
      </li>
    );
  };

  return (
    <section className="space-y-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3 rounded-lg border-s-4 border-primary/40 bg-primary/5 px-3 py-2.5 text-sm text-on-surface">
        <MaterialSymbol name="schedule" size="text-lg" className="shrink-0 text-primary" />
        {pickupLine}
      </div>

      {awaiting.length ? (
        <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3" data-testid="dashboard-awaiting-answers">
          <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <MaterialSymbol name="pending_actions" size="text-lg" className="text-warning" />
            {t('parent.dashboard.schedule.awaitingTitle', { count: awaiting.length })}
          </p>
          <ul className="space-y-1.5">
            {awaiting.slice(0, 3).map((a) => {
              const names = childName ? a.childIds.map(childName).filter(Boolean).join(isAr ? '، ' : ', ') : '';
              return (
                <li key={a.eventId}>
                  <Link
                    to={`/parent/events/${a.eventId}`}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2 text-sm transition hover:bg-primary/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-on-surface">{localName(a.titleAr, a.titleEn, isAr)}</span>
                      {names ? <span className="block text-xs text-on-surface-variant">{t('parent.dashboard.schedule.awaitingFor', { names })}</span> : null}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                      <MaterialSymbol name="hourglass_top" size="text-sm" />
                      {t('parent.dashboard.schedule.answerBy', { date: dueFmt.format(new Date(a.deadline ?? a.startsAt)) })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {awaiting.length > 3 ? (
            <Link to="/parent/permissions" className="inline-flex text-xs font-semibold text-primary hover:underline">
              {t('parent.dashboard.schedule.awaitingMore', { count: awaiting.length - 3 })}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* A day whose events all wait for an answer shows them only in the card above. */}
      {today.length || !todayEvents.length ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">{t('parent.dashboard.schedule.today')}</h3>
          {today.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant px-3 py-3 text-sm text-on-surface-variant">{t('parent.dashboard.schedule.noToday')}</p>
          ) : (
            <ul className="space-y-2">{today.map((e) => eventRow(e, false))}</ul>
          )}
        </div>
      ) : null}

      {week.length || !upcoming.length ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">{t('parent.dashboard.schedule.upcoming')}</h3>
          {week.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant px-3 py-3 text-sm text-on-surface-variant">{t('parent.dashboard.schedule.noUpcoming')}</p>
          ) : (
            <ul className="space-y-2">{week.map((e) => eventRow(e, true))}</ul>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/parent/events" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {t('parent.dashboard.schedule.allEvents')}
          <MaterialSymbol name="arrow_forward" size="text-base" className="rtl:rotate-180" />
        </Link>
        <Link to="/parent/events/create" className="inline-flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary">
          <MaterialSymbol name="campaign" size="text-base" />
          {t('parent.dashboard.schedule.tellNursery')}
        </Link>
      </div>
    </section>
  );
}
