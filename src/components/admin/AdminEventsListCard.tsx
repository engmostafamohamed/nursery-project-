import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { EventPermissionStats } from '@/hooks/useAdminEventPermissionStats';
import {
  inferEventListStatus,
  type AdminEventsListRow,
} from '@/hooks/useAdminEventsList';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';

type ListStatus = ReturnType<typeof inferEventListStatus>;

function statusBadgeClass(listStatus: ListStatus): string {
  switch (listStatus) {
    case 'draft':
      return 'border-outline-variant bg-surface-container-highest text-on-surface-variant';
    case 'active':
      return 'border-transparent bg-secondary-fixed text-on-primary-fixed';
    case 'completed':
      return 'border-transparent bg-success/10 text-success';
    case 'cancelled':
      return 'border-transparent bg-error-container text-on-error-container';
    default:
      return 'border-outline-variant bg-surface-container text-on-surface';
  }
}

const CATEGORY_ICON: Record<string, string> = {
  trip: 'directions_bus',
  activity: 'celebration',
  service: 'volunteer_activism',
  doctor_visit: 'medical_services',
};
function categoryIcon(category: AdminEventsListRow['category']): string {
  return CATEGORY_ICON[category] ?? 'event';
}

function categoryBadgeClass(category: AdminEventsListRow['category']): string {
  switch (category) {
    case 'trip':
      return 'border-transparent bg-violet-100 text-violet-900';
    case 'activity':
      return 'border-transparent bg-info/10 text-info';
    case 'service':
      return 'border-transparent bg-accent text-accent-foreground';
    case 'doctor_visit':
      return 'border-transparent bg-success/10 text-success';
    default:
      return 'border-outline-variant bg-surface-container text-on-surface';
  }
}

type Props = {
  event: AdminEventsListRow;
  qs: string;
  stats: EventPermissionStats | undefined;
  dateTimeFmt: Intl.DateTimeFormat;
  eventTitle: (event: AdminEventsListRow) => string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onDeleteRequest: (id: string) => void;
  onCancelRequest: (id: string) => void;
  onDuplicate: (id: string) => void;
  duplicateBusy: boolean;
};

export function AdminEventsListCard({
  event,
  qs,
  stats,
  dateTimeFmt,
  eventTitle,
  canCreate,
  canUpdate,
  canDelete,
  onDeleteRequest,
  onCancelRequest,
  onDuplicate,
  duplicateBusy,
}: Props) {
  const { t } = useTranslation();
  const listStatus = inferEventListStatus(event);
  const urgentSchedule = summarizeUrgentSchedule(event, t);

  return (
    <article
      className={
        'relative overflow-hidden rounded-2xl border bg-surface-container-lowest p-4 transition-colors hover:border-primary/40 ' +
        (event.is_urgent ? 'border-error/50 bg-error-container/10' : 'border-outline-variant')
      }
    >
      {event.is_urgent ? <span className="absolute inset-y-0 start-0 w-1.5 bg-error" aria-hidden /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${event.is_urgent ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
            <MaterialSymbol name={event.is_urgent ? 'priority_high' : categoryIcon(event.category)} size="text-xl" />
          </span>
          <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-on-surface">{eventTitle(event)}</h2>
          <p className="flex items-center gap-1 text-sm text-on-surface-variant">
            <MaterialSymbol name="schedule" size="text-sm" />
            {dateTimeFmt.format(new Date(event.starts_at))}
          </p>
          {urgentSchedule ? (
            <p className="flex items-center gap-1 text-sm text-error">
              <MaterialSymbol name="event_repeat" size="text-sm" />
              {urgentSchedule}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge className={categoryBadgeClass(event.category)}>
              {t(`admin.events.create.categories.${event.category}`)}
            </Badge>
            {event.is_urgent ? (
              <Badge className="border-transparent bg-error text-white">
                {t('admin.events.list.urgentBadge')}
              </Badge>
            ) : null}
            <Badge
              className={
                event.is_paid
                  ? 'border-transparent bg-secondary-container/30 text-on-secondary-container'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant'
              }
            >
              {event.is_paid
                ? t('admin.events.list.paidBadge', { amount: event.price ?? '0' })
                : t('admin.events.list.freeBadge')}
            </Badge>
            <Badge className="border-outline-variant bg-surface-container-low text-on-surface">
              {t(`admin.events.list.scope.${event.target_scope}`)}
            </Badge>
            <Badge className={statusBadgeClass(listStatus)}>
              {t(`admin.events.list.statusBadge.${listStatus}`)}
            </Badge>
            {stats && stats.total > 0 ? (
              <Badge className="border-outline-variant bg-surface-container-high text-on-surface-variant">
                {t('admin.events.list.participantSummary', {
                  total: stats.total,
                  granted: stats.granted,
                  pending: stats.pending,
                })}
              </Badge>
            ) : null}
          </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/events/${event.id}${qs}`}>{t('admin.events.list.actions.view')}</Link>
          </Button>
          {canUpdate ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/events/${event.id}/edit${qs}`}>{t('admin.events.list.actions.edit')}</Link>
            </Button>
          ) : null}
          {canCreate ? (
            <Button
              variant="outline"
              size="sm"
              disabled={duplicateBusy}
              onClick={() => onDuplicate(event.id)}
            >
              {t('admin.events.list.actions.duplicate')}
            </Button>
          ) : null}
          {canUpdate && listStatus === 'active' ? (
            <Button variant="outline" size="sm" onClick={() => onCancelRequest(event.id)}>
              {t('admin.events.list.actions.cancelEvent')}
            </Button>
          ) : null}
          {canDelete && listStatus === 'draft' ? (
            <Button variant="outline" size="sm" onClick={() => onDeleteRequest(event.id)}>
              {t('admin.events.list.actions.delete')}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
