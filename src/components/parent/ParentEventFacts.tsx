import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TableCard } from '@/components/ui/DataTable';
import { Fact, FactList } from '@/components/ui/FactList';
import { eventTimeRange } from '@/features/events/events';
import { useMoney } from '@/hooks/useMoney';
import type { ParentEventDetailsEvent, ParentEventDetailsPermission } from '@/hooks/useParentEventDetails';
import { localName } from '@/lib/bilingualName';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';

type T = (key: string, opts?: Record<string, number | string>) => string;

function durationText(ms: number, t: T): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return t('parent.events.details.durationMinutes', { count: mins });
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return minutes === 0 ? t('parent.events.details.durationHours', { count: hours }) : t('parent.events.details.durationHoursMinutes', { hours, minutes });
}

function startsInText(ms: number, t: T): string {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return t('parent.events.details.startsInDays', { count: days });
  if (hours > 0) return t('parent.events.details.startsInHours', { count: hours });
  return t('parent.events.details.startsInMinutes', { count: Math.max(1, Math.floor((ms % 3600000) / 60000)) });
}

/**
 * An event's facts for a family, each once: what it is about, when (and how soon, how long, every
 * week), where, for whom, what it costs and until when to answer. A family's own urgent event shows
 * no price nor answer deadline (it needs no answer).
 */
export function ParentEventFacts({ event, permissions, ownEvent }: {
  event: ParentEventDetailsEvent;
  permissions: ParentEventDetailsPermission[];
  ownEvent: boolean;
}) {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const dateTime = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  const [nowMs] = useState(Date.now);
  const open = event.status === 'active' && !event.cancelled_at;

  const description = localName(event.description_ar, event.description_en, isAr);
  const untilStart = new Date(event.starts_at).getTime() - nowMs;
  const length = event.ends_at ? new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime() : 0;
  const repeat = summarizeUrgentSchedule(event, t);
  const price = event.is_paid && event.price ? Number(event.price) : 0;
  const children = permissions.map((p) => localName(p.childNameAr, p.childNameEn, isAr)).join(isAr ? '، ' : ', ');
  const forWhom =
    ownEvent || event.target_scope === 'individual'
      ? children || t('parent.events.details.targetIndividual')
      : event.target_scope === 'class'
        ? t('parent.events.details.targetClass', { name: localName(event.classNameAr, event.classNameEn, isAr) || '—' })
        : t('parent.events.details.targetAll');

  return (
    <TableCard title={t('parent.events.details.detailsCardTitle')}>
      {description ? <p className="whitespace-pre-line border-b border-outline-variant px-4 py-3 text-sm text-on-surface sm:px-5">{description}</p> : null}
      <FactList>
        <Fact
          icon="schedule"
          label={t('parent.events.details.sectionWhen')}
          value={
            <span className="block">
              {eventTimeRange(event.starts_at, event.ends_at, locale)}
              {open && untilStart > 0 ? (
                <span className="block text-xs font-normal text-primary">{t('parent.events.details.eventStartsIn', { text: startsInText(untilStart, t) })}</span>
              ) : null}
            </span>
          }
        />
        {length > 0 ? <Fact icon="timelapse" label={t('parent.events.details.durationLabel')} value={durationText(length, t)} /> : null}
        {repeat ? <Fact icon="event_repeat" label={t('parent.events.details.repeatsLabel')} value={repeat} /> : null}
        <Fact icon="location_on" label={t('parent.events.details.sectionWhere')} value={event.location || t('parent.events.details.locationTbd')} />
        <Fact icon="group" label={t('parent.events.details.sectionWho')} value={forWhom} />
        {!ownEvent ? (
          <Fact
            icon="payments"
            label={t('parent.events.details.sectionCost')}
            value={price > 0 ? t('parent.events.details.pricePerChild', { amount: money(price) }) : t('parent.events.details.free')}
          />
        ) : null}
        {!ownEvent && event.permission_deadline ? (
          <Fact icon="hourglass_top" label={t('parent.events.details.permissionDeadlineLabel')} value={dateTime.format(new Date(event.permission_deadline))} />
        ) : null}
      </FactList>
    </TableCard>
  );
}
