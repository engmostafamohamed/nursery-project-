import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { StatusPill, Td, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ParentCatalogEventRow, ParentCatalogPermissionRow } from '@/hooks/useParentEventsCatalog';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { summarizePermissionsForEvent } from '@/lib/parentEventPermissionSummary';
import { categoryTone } from '@/lib/parentEventsCalendarUtils';

type Props = {
  event: ParentCatalogEventRow;
  permissions: ParentCatalogPermissionRow[];
  dateTimeFmt: Intl.DateTimeFormat;
  deadlineFmt: Intl.DateTimeFormat;
  priceFmt: Intl.NumberFormat;
};

/** One event in the family's events table: its day, name and kind, when and where, the price, and the children's permission. */
export function ParentEventRow({ event, permissions, dateTimeFmt, deadlineFmt, priceFmt }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const title = (isAr ? event.title_ar : event.title_en) || event.title_en || event.title_ar;
  const summary = summarizePermissionsForEvent(permissions, event.id, isAr);
  const priceNum = event.price != null && event.price !== '' ? Number(event.price) : 0;
  const urgentSchedule = summarizeUrgentSchedule(event, t);

  const permissionPill =
    summary.kind === 'none' ? (
      <StatusPill tone="neutral">{t('parent.events.permissionNone')}</StatusPill>
    ) : summary.kind === 'pending' ? (
      <StatusPill tone="warning" icon="pending_actions">{t('parent.events.permissionPending')}</StatusPill>
    ) : summary.kind === 'approved' ? (
      <StatusPill tone="success" icon="task_alt">{t('parent.events.permissionApproved')}</StatusPill>
    ) : (
      <StatusPill tone="error" icon="block">{t('parent.events.permissionDeclined')}</StatusPill>
    );

  return (
    <Tr onClick={() => navigate(`/parent/events/${event.id}`)} data-testid="event-row">
      <Td className="w-16">
        <EventDateBlock startsAt={event.starts_at} category={event.category} locale={locale} className="h-12 w-11" />
      </Td>
      <Td className="min-w-[12rem]">
        <span className="block font-semibold text-on-surface">{title}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          {event.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('parent.events.urgentBadge')}</StatusPill> : null}
          <StatusPill tone={categoryTone(event.category)}>{t(`admin.events.create.categories.${event.category}`, { defaultValue: event.category })}</StatusPill>
        </span>
      </Td>
      <Td className="whitespace-nowrap">
        <span className="block text-on-surface">{dateTimeFmt.format(new Date(event.starts_at))}</span>
        {urgentSchedule ? <span className="block text-xs font-medium text-error">{urgentSchedule}</span> : null}
      </Td>
      <Td className="max-w-[12rem]">
        <span className="block truncate text-on-surface-variant" title={event.location ?? undefined}>{event.location || '—'}</span>
      </Td>
      <Td className="whitespace-nowrap">
        {event.is_paid && priceNum > 0 ? <span className="font-semibold text-on-surface">{priceFmt.format(priceNum)}</span> : <span className="text-on-surface-variant">{t('parent.events.free')}</span>}
      </Td>
      <Td>
        {permissionPill}
        {(summary.kind === 'pending' || summary.kind === 'approved') && summary.names.length ? (
          <span className="mt-1 block max-w-[12rem] truncate text-xs text-on-surface-variant">{summary.names.join(t('parent.events.listJoin'))}</span>
        ) : null}
        {event.permission_deadline ? (
          <span className="mt-0.5 block whitespace-nowrap text-xs text-on-surface-variant">
            {t('parent.events.cardDeadline', { date: deadlineFmt.format(new Date(event.permission_deadline)) })}
          </span>
        ) : null}
      </Td>
      <Td align="end">
        <MaterialSymbol name="chevron_right" size="text-xl" className="text-primary rtl:rotate-180" />
      </Td>
    </Tr>
  );
}
