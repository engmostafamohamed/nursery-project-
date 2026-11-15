import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { Button } from '@/components/ui/button';
import { IconAction, StatusPill, Td, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { EventPermissionStats } from '@/hooks/useAdminEventPermissionStats';
import type { AdminEventsListRow } from '@/hooks/useAdminEventsList';
import { useMoney } from '@/hooks/useMoney';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { cn } from '@/lib/utils';

import { EventRepliesBar } from './EventRepliesBar';
import { CATEGORY_ICON, categoryToneOf, eventTimeRange, SCOPE_ICON, STAGE_ICON, STAGE_TONE, type EventCategory, type EventStage } from './events';

/**
 * One event in the admin's events table: the day in its category's colour, the name with its stage,
 * when and for whom, the price, the families' replies, and what the admin can do next.
 */
export function AdminEventRow({ event, title, stage, stats, qs, can, actions }: {
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
  const urgent = summarizeUrgentSchedule(event, t);
  const price = event.is_paid ? Number(event.price ?? 0) : 0;
  const href = `/admin/events/${event.id}${qs}`;
  const open = stage === 'draft' || stage === 'active';

  return (
    <Tr className={cn(stage === 'cancelled' && 'opacity-80')} data-testid="admin-event-row">
      <Td className="w-16">
        <EventDateBlock startsAt={event.starts_at} category={event.category} locale={locale} className="h-12 w-11" />
      </Td>
      <Td className="min-w-[13rem]">
        <Link to={href} className="block break-words font-semibold text-on-surface hover:text-primary focus-visible:underline focus-visible:outline-none">
          {title}
        </Link>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <StatusPill tone={STAGE_TONE[stage]} icon={STAGE_ICON[stage]}>{t(`admin.events.list.statusBadge.${stage}`)}</StatusPill>
          {event.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('admin.events.list.urgentBadge')}</StatusPill> : null}
          <StatusPill tone={categoryToneOf(event.category)} icon={CATEGORY_ICON[event.category as EventCategory]}>{t(`admin.events.create.categories.${event.category}`)}</StatusPill>
        </span>
      </Td>
      <Td className="whitespace-nowrap">
        <span className="block text-on-surface">{eventTimeRange(event.starts_at, event.ends_at, locale)}</span>
        {urgent ? <span className="block text-xs font-medium text-error">{urgent}</span> : null}
      </Td>
      <Td className="whitespace-nowrap text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <MaterialSymbol name={SCOPE_ICON[event.target_scope]} size="text-base" />
          {t(`admin.events.list.scope.${event.target_scope}`)}
        </span>
      </Td>
      <Td className={cn('whitespace-nowrap', price > 0 ? 'font-semibold text-on-surface' : 'text-on-surface-variant')}>
        {price > 0 ? money(price) : t('eventForm.preview.free')}
      </Td>
      <Td className="min-w-[11rem]">
        {stage === 'draft' ? <span className="text-xs text-on-surface-variant">{t('eventForm.notSentYet')}</span> : <EventRepliesBar stats={stats} />}
      </Td>
      <Td align="end">
        <span className="flex items-center justify-end gap-0.5">
          <IconAction icon="visibility" label={t('admin.events.list.actions.view')} to={href} />
          {can.update && open ? <IconAction icon="edit" label={t('admin.events.list.actions.edit')} to={`/admin/events/${event.id}/edit${qs}`} /> : null}
          {can.create ? <IconAction icon="content_copy" label={t('admin.events.list.actions.duplicate')} onClick={actions.duplicate} disabled={actions.busy} /> : null}
          {can.delete && (stage === 'draft' || stage === 'cancelled') ? <IconAction icon="delete" label={t('admin.events.list.actions.delete')} onClick={actions.remove} disabled={actions.busy} danger /> : null}
          {can.update && stage === 'draft' ? (
            <Button type="button" size="sm" className="ms-1 gap-1.5" onClick={actions.publish} disabled={actions.busy} data-testid="event-card-publish">
              <MaterialSymbol name="send" size="text-base" className="rtl:rotate-180" />
              {t('admin.events.create.publish')}
            </Button>
          ) : can.update && stage === 'active' ? (
            <IconAction icon="event_busy" label={t('admin.events.list.actions.cancelEvent')} onClick={actions.cancel} disabled={actions.busy} danger />
          ) : null}
        </span>
      </Td>
    </Tr>
  );
}
