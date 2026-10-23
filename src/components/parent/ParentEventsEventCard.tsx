import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusPill } from '@/components/ui/DataTable';
import type { ParentCatalogEventRow, ParentCatalogPermissionRow } from '@/hooks/useParentEventsCatalog';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { summarizePermissionsForEvent } from '@/lib/parentEventPermissionSummary';
import { categoryTone, type EventCategoryTone } from '@/lib/parentEventsCalendarUtils';
import { cn } from '@/lib/utils';

/** Tinted date block per category colour. */
const DATE_BLOCK: Record<EventCategoryTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  neutral: 'bg-surface-high text-on-surface-variant',
};

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
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const title = (isAr ? event.title_ar : event.title_en) || event.title_en || event.title_ar;
  const summary = summarizePermissionsForEvent(permissions, event.id, isAr);
  const priceNum = event.price != null && event.price !== '' ? Number(event.price) : 0;
  const urgentSchedule = summarizeUrgentSchedule(event, t);
  const startsAt = new Date(event.starts_at);
  const tone = categoryTone(event.category);

  const permissionPill =
    summary.kind === 'none' ? (
      <StatusPill tone="neutral">{t('parent.events.permissionNone')}</StatusPill>
    ) : summary.kind === 'pending' ? (
      <StatusPill tone="warning" icon="pending_actions">
        {t('parent.events.permissionPending')}
        {summary.names.length ? ` · ${summary.names.join(', ')}` : null}
      </StatusPill>
    ) : summary.kind === 'approved' ? (
      <StatusPill tone="success" icon="task_alt">
        {t('parent.events.permissionApproved')}
        {summary.names.length ? ` · ${summary.names.join(', ')}` : null}
      </StatusPill>
    ) : (
      <StatusPill tone="error" icon="block">{t('parent.events.permissionDeclined')}</StatusPill>
    );

  return (
    <Link
      to={`/parent/events/${event.id}`}
      className={cn(
        'group flex gap-4 rounded-xl border bg-surface p-4 shadow-sm outline-none transition hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/30',
        event.is_urgent ? 'border-error/40' : 'border-outline-variant',
      )}
    >
      <div className={cn('flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg', DATE_BLOCK[tone])}>
        <span className="text-[11px] font-semibold uppercase">{startsAt.toLocaleDateString(locale, { month: 'short' })}</span>
        <span className="text-2xl font-bold leading-none tabular-nums">{startsAt.toLocaleDateString(locale, { day: 'numeric' })}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold text-on-surface group-hover:text-primary">{title}</h3>
          <div className="flex flex-wrap gap-1.5">
            {event.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('parent.events.urgentBadge')}</StatusPill> : null}
            <StatusPill tone={tone}>{t(`admin.events.create.categories.${event.category}`, { defaultValue: event.category })}</StatusPill>
          </div>
        </div>

        <div className="space-y-1 text-sm text-on-surface-variant">
          <p className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base" aria-hidden>schedule</span>
            {dateTimeFmt.format(startsAt)}
          </p>
          {urgentSchedule ? (
            <p className="flex items-center gap-1.5 font-medium text-error">
              <span className="material-symbols-outlined text-base" aria-hidden>event_repeat</span>
              {urgentSchedule}
            </p>
          ) : null}
          {event.location ? (
            <p className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base" aria-hidden>location_on</span>
              {event.location}
            </p>
          ) : null}
          {event.is_paid && priceNum > 0 ? (
            <p className="flex items-center gap-1.5 font-semibold text-on-surface">
              <span className="material-symbols-outlined text-base text-primary" aria-hidden>payments</span>
              {t('parent.events.cardPrice', { amount: priceFmt.format(priceNum) })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-2">
          {permissionPill}
          {event.permission_deadline ? (
            <span className="text-xs text-on-surface-variant">
              {t('parent.events.cardDeadline', { date: deadlineFmt.format(new Date(event.permission_deadline)) })}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
