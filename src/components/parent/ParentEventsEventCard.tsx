import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ParentCatalogEventRow, ParentCatalogPermissionRow } from '@/hooks/useParentEventsCatalog';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { summarizePermissionsForEvent } from '@/lib/parentEventPermissionSummary';

function categoryClass(cat: string): string {
  switch (cat) {
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
  event: ParentCatalogEventRow;
  permissions: ParentCatalogPermissionRow[];
  dateTimeFmt: Intl.DateTimeFormat;
  deadlineFmt: Intl.DateTimeFormat;
  priceFmt: Intl.NumberFormat;
};

export function ParentEventsEventCard({
  event,
  permissions,
  dateTimeFmt,
  deadlineFmt,
  priceFmt,
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language.startsWith('ar');
  const title = (isAr ? event.title_ar : event.title_en) || event.title_en || event.title_ar;
  const summary = summarizePermissionsForEvent(permissions, event.id, isAr);
  const priceNum = event.price != null && event.price !== '' ? Number(event.price) : 0;
  const urgentSchedule = summarizeUrgentSchedule(event, t);

  const permBadge =
    summary.kind === 'none' ? (
      <Badge className="border-outline-variant bg-surface-container text-on-surface-variant">
        {t('parent.events.permissionNone')}
      </Badge>
    ) : summary.kind === 'pending' ? (
      <Badge className="border-warning/40 bg-warning/10 text-warning">
        {t('parent.events.permissionPending')}
        {summary.names.length ? ` · ${summary.names.join(', ')}` : null}
      </Badge>
    ) : summary.kind === 'approved' ? (
      <Badge className="border-success/40 bg-success/10 text-success">
        {t('parent.events.permissionApproved')}
        {summary.names.length ? ` · ${summary.names.join(', ')}` : null}
      </Badge>
    ) : (
      <Badge className="border-error/40 bg-error/10 text-error">{t('parent.events.permissionDeclined')}</Badge>
    );

  return (
    <Card
      role="button"
      tabIndex={0}
      className={`cursor-pointer transition-colors hover:bg-surface-container-low ${event.is_urgent ? 'border-error/50 bg-error-container/10' : ''}`}
      onClick={() => navigate(`/parent/events/${event.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/parent/events/${event.id}`);
        }
      }}
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          <div className="flex flex-wrap gap-2">
            {event.is_urgent ? (
              <Badge className="border-transparent bg-error text-white">
                {t('parent.events.urgentBadge')}
              </Badge>
            ) : null}
            <Badge className={categoryClass(event.category)}>
              {t(`admin.events.create.categories.${event.category}`, { defaultValue: event.category })}
            </Badge>
          </div>
        </div>
        <p className="inline-flex items-center gap-1 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-base" aria-hidden>
            schedule
          </span>
          {dateTimeFmt.format(new Date(event.starts_at))}
        </p>
        {urgentSchedule ? (
          <p className="inline-flex items-center gap-1 text-sm font-medium text-error">
            <span className="material-symbols-outlined text-base" aria-hidden>
              event_repeat
            </span>
            {urgentSchedule}
          </p>
        ) : null}
        {event.location ? (
          <p className="inline-flex items-center gap-1 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-base" aria-hidden>
              location_on
            </span>
            {event.location}
          </p>
        ) : null}
        {event.is_paid && priceNum > 0 ? (
          <p className="text-sm font-semibold text-secondary">
            {t('parent.events.cardPrice', { amount: priceFmt.format(priceNum) })}
          </p>
        ) : null}
        {event.permission_deadline ? (
          <p className="text-xs text-on-surface-variant">
            {t('parent.events.cardDeadline', { date: deadlineFmt.format(new Date(event.permission_deadline)) })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">{permBadge}</div>
      </CardContent>
    </Card>
  );
}
