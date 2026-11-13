import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { Button } from '@/components/ui/button';
import { IconAction, StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { EventPermissionStats } from '@/hooks/useAdminEventPermissionStats';
import type { AdminEventsListRow } from '@/hooks/useAdminEventsList';
import { useMoney } from '@/hooks/useMoney';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { cn } from '@/lib/utils';

import { EventRepliesBar } from './EventRepliesBar';
import { CATEGORY_ICON, categoryToneOf, eventTimeRange, SCOPE_ICON, STAGE_ICON, STAGE_TONE, type EventCategory, type EventStage } from './events';

/**
 * One event in the admin's list: the date in its category's colour, the title with its stage, when
 * and for whom, the price, the families' replies, and what the admin can do next.
 */
export function AdminEventCard({ event, title, stage, stats, qs, can, actions }: {
  event: AdminEventsListRow;
  title: string;
  stage: EventStage;
  stats: EventPermissionStats | undefined;
  qs: string;
  can: { create: boolean; update: boolean; delete: boolean };
  actions: { publish: () => void; cancel: () => void; duplicate: () => void; remove: () => void; busy: boolean };
}) {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const tone = categoryToneOf(event.category);
  const urgent = summarizeUrgentSchedule(event, t);
  const price = event.is_paid ? Number(event.price ?? 0) : 0;
  const href = `/admin/events/${event.id}${qs}`;
  const open = stage === 'draft' || stage === 'active';

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-surface shadow-sm transition hover:border-primary/40 hover:shadow-md',
        event.is_urgent && stage === 'active' ? 'border-error/40' : 'border-outline-variant',
        stage === 'cancelled' && 'opacity-80',
      )}
      data-testid="admin-event-card"
    >
      <div className="flex flex-1 gap-4 p-4">
        <EventDateBlock startsAt={event.starts_at} category={event.category} locale={locale} />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1.5">
            <Link to={href} className="block break-words text-base font-semibold text-on-surface hover:text-primary focus-visible:underline focus-visible:outline-none">
              {title}
            </Link>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill tone={STAGE_TONE[stage]} icon={STAGE_ICON[stage]}>{t(`admin.events.list.statusBadge.${stage}`)}</StatusPill>
              {event.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('admin.events.list.urgentBadge')}</StatusPill> : null}
              <StatusPill tone={tone} icon={CATEGORY_ICON[event.category as EventCategory]}>{t(`admin.events.create.categories.${event.category}`)}</StatusPill>
            </div>
          </div>

          <div className="space-y-1 text-sm text-on-surface-variant">
            <p className="flex items-start gap-1.5">
              <MaterialSymbol name="schedule" size="text-base" className="mt-0.5 shrink-0" />
              {eventTimeRange(event.starts_at, event.ends_at, locale)}
            </p>
            {urgent ? (
              <p className="flex items-start gap-1.5 font-medium text-error">
                <MaterialSymbol name="event_repeat" size="text-base" className="mt-0.5 shrink-0" />
                {urgent}
              </p>
            ) : null}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <MaterialSymbol name={SCOPE_ICON[event.target_scope]} size="text-base" />
                {t(`admin.events.list.scope.${event.target_scope}`)}
              </span>
              <span className={cn('inline-flex items-center gap-1.5', price > 0 && 'font-semibold text-on-surface')}>
                <MaterialSymbol name={price > 0 ? 'payments' : 'money_off'} size="text-base" />
                {price > 0 ? money(price) : t('eventForm.preview.free')}
              </span>
            </p>
          </div>

          {stage === 'draft' ? (
            <p className="text-xs text-on-surface-variant">{t('eventForm.notSentYet')}</p>
          ) : (
            <EventRepliesBar stats={stats} />
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant px-3 py-2">
        <div className="flex items-center gap-0.5">
          <IconAction icon="visibility" label={t('admin.events.list.actions.view')} to={href} />
          {can.update && open ? <IconAction icon="edit" label={t('admin.events.list.actions.edit')} to={`/admin/events/${event.id}/edit${qs}`} /> : null}
          {can.create ? <IconAction icon="content_copy" label={t('admin.events.list.actions.duplicate')} onClick={actions.duplicate} disabled={actions.busy} /> : null}
          {can.delete && (stage === 'draft' || stage === 'cancelled') ? <IconAction icon="delete" label={t('admin.events.list.actions.delete')} onClick={actions.remove} disabled={actions.busy} danger /> : null}
        </div>
        {can.update && stage === 'draft' ? (
          <Button type="button" size="sm" className="gap-1.5" onClick={actions.publish} disabled={actions.busy} data-testid="event-card-publish">
            <MaterialSymbol name="send" size="text-base" className="rtl:rotate-180" />
            {t('admin.events.create.publish')}
          </Button>
        ) : can.update && stage === 'active' ? (
          <Button type="button" size="sm" variant="outline" className="gap-1.5 border-error/40 text-error hover:bg-error/10" onClick={actions.cancel} disabled={actions.busy}>
            <MaterialSymbol name="event_busy" size="text-base" />
            {t('admin.events.list.actions.cancelEvent')}
          </Button>
        ) : null}
      </footer>
    </article>
  );
}
