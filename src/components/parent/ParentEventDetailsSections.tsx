import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { inferEventListStatus, type AdminEventsListRow } from '@/hooks/useAdminEventsList';
import type { ParentEventDetailsEvent, ParentEventDetailsPermission } from '@/hooks/useParentEventDetails';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';

import {
  ParentEventDetailsPaymentBlock,
  ParentEventDetailsPermissionList,
} from '@/components/parent/ParentEventDetailsPermissionList';

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

function SectionRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-outline-variant/60 py-3 last:border-0 last:pb-0">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-xl text-secondary" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-on-surface-variant">{label}</p>
        <div className="mt-1 text-sm text-on-surface">{children}</div>
      </div>
    </div>
  );
}

function formatDurationMs(ms: number, t: (key: string, opts?: Record<string, number>) => string): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return t('parent.events.details.durationMinutes', { count: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return t('parent.events.details.durationHours', { count: h });
  return t('parent.events.details.durationHoursMinutes', { hours: h, minutes: m });
}

function startsInFromMs(diffMs: number, t: (key: string, opts?: Record<string, number>) => string): string {
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (days > 0) return t('parent.events.details.startsInDays', { count: days });
  if (hours > 0) return t('parent.events.details.startsInHours', { count: hours });
  return t('parent.events.details.startsInMinutes', { count: Math.max(1, minutes) });
}

export type ParentEventDetailsSectionsProps = {
  event: ParentEventDetailsEvent;
  permissions: ParentEventDetailsPermission[];
  dateFmt: Intl.DateTimeFormat;
  timeFmt: Intl.DateTimeFormat;
  dateTimeFmt: Intl.DateTimeFormat;
  priceFmt: Intl.NumberFormat;
  deadlinePassed: boolean;
  onShare: () => void;
  onApprove: (permissionId: string) => void;
  onDenyOpen: (p: ParentEventDetailsPermission) => void;
  busyId: string | null;
  busyAction: 'approve' | 'deny' | null;
};

export function ParentEventDetailsSections({
  event,
  permissions,
  dateFmt,
  timeFmt,
  dateTimeFmt,
  priceFmt,
  deadlinePassed,
  onShare,
  onApprove,
  onDenyOpen,
  busyId,
  busyAction,
}: ParentEventDetailsSectionsProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');

  const title = (isAr ? event.title_ar : event.title_en) || event.title_en || event.title_ar;
  const description = (isAr ? event.description_ar : event.description_en)?.trim() || null;
  const inferred = inferEventListStatus(event as AdminEventsListRow);
  const showStatusBadge = inferred === 'cancelled' || inferred === 'completed';

  const targetLabel = useMemo(() => {
    if (event.target_scope === 'class') {
      const cn = (isAr ? event.classNameAr : event.classNameEn) || event.classNameEn || event.classNameAr;
      return t('parent.events.details.targetClass', { name: cn ?? '—' });
    }
    if (event.target_scope === 'individual') return t('parent.events.details.targetIndividual');
    return t('parent.events.details.targetAll');
  }, [event, isAr, t]);

  const durationLine = useMemo(() => {
    if (!event.ends_at) return null;
    const ms = new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime();
    if (ms <= 0) return null;
    return formatDurationMs(ms, t);
  }, [event.ends_at, event.starts_at, t]);

  const [nowMs] = useState(Date.now);
  const startsIn = useMemo(() => {
    const diff = new Date(event.starts_at).getTime() - nowMs;
    if (diff <= 0 || inferred === 'cancelled') return null;
    return startsInFromMs(diff, t);
  }, [event.starts_at, inferred, t, nowMs]);

  const priceNum = event.price != null && event.price !== '' ? Number(event.price) : 0;
  const urgentSchedule = summarizeUrgentSchedule(event, t);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-on-surface">{title}</h1>
            {showStatusBadge ? (
              <Badge
                className={
                  inferred === 'cancelled'
                    ? 'border-error/40 bg-error/10 text-error'
                    : 'border-outline-variant bg-surface-container text-on-surface'
                }
              >
                {t(`parent.events.details.eventStatus.${inferred}`)}
              </Badge>
            ) : null}
            {event.is_urgent ? (
              <Badge className="border-transparent bg-error text-white">
                {t('parent.events.urgentBadge')}
              </Badge>
            ) : null}
          </div>
          {description ? <p className="text-sm text-on-surface-variant">{description}</p> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1" aria-label={t('parent.events.details.ariaWhen')}>
              <span className="material-symbols-outlined text-base" aria-hidden>
                calendar_month
              </span>
              <span>{dateFmt.format(new Date(event.starts_at))}</span>
              <span className="text-on-surface-variant/80">{timeFmt.format(new Date(event.starts_at))}</span>
            </span>
            {event.location ? (
              <span className="inline-flex min-w-0 items-center gap-1" aria-label={t('parent.events.details.ariaWhere')}>
                <span className="material-symbols-outlined shrink-0 text-base" aria-hidden>
                  map
                </span>
                <span className="min-w-0 break-words">{event.location}</span>
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={categoryClass(event.category)}>
              {t(`admin.events.create.categories.${event.category}`, { defaultValue: event.category })}
            </Badge>
            {durationLine ? (
              <Badge className="border-outline-variant bg-surface-container text-on-surface-variant">
                {t('parent.events.details.durationBadge', { duration: durationLine })}
              </Badge>
            ) : null}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={onShare} aria-label={t('parent.events.details.ariaShare')}>
          <span className="material-symbols-outlined text-base" aria-hidden>
            share
          </span>
          {t('parent.events.details.share')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('parent.events.details.detailsCardTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 pt-0">
              {description ? (
                <SectionRow icon="description" label={t('parent.events.details.sectionWhat')}>
                  {description}
                </SectionRow>
              ) : null}
              <SectionRow icon="schedule" label={t('parent.events.details.sectionWhen')}>
                <p>{dateTimeFmt.format(new Date(event.starts_at))}</p>
                {event.ends_at ? (
                  <p className="mt-1 text-on-surface-variant">
                    {t('parent.events.details.endsAt', { date: dateTimeFmt.format(new Date(event.ends_at)) })}
                  </p>
                ) : null}
                {durationLine ? <p className="mt-1 text-on-surface-variant">{durationLine}</p> : null}
                {urgentSchedule ? <p className="mt-1 font-medium text-error">{urgentSchedule}</p> : null}
              </SectionRow>
              <SectionRow icon="location_on" label={t('parent.events.details.sectionWhere')}>
                {event.location || t('parent.events.details.locationTbd')}
              </SectionRow>
              <SectionRow icon="group" label={t('parent.events.details.sectionWho')}>
                {targetLabel}
              </SectionRow>
              <SectionRow icon="payments" label={t('parent.events.details.sectionCost')}>
                {event.is_paid && priceNum > 0
                  ? t('parent.events.details.pricePerChild', { amount: priceFmt.format(priceNum) })
                  : t('parent.events.details.free')}
              </SectionRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('parent.events.details.datesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-on-surface-variant">
              {event.permission_deadline ? (
                <p>
                  <span className="font-medium text-on-surface">{t('parent.events.details.permissionDeadlineLabel')}: </span>
                  {dateTimeFmt.format(new Date(event.permission_deadline))}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-on-surface">{t('parent.events.details.eventDateLabel')}: </span>
                {dateTimeFmt.format(new Date(event.starts_at))}
              </p>
              {startsIn ? (
                <p className="text-secondary">
                  <span className="material-symbols-outlined align-middle text-base" aria-hidden>
                    hourglass_top
                  </span>{' '}
                  {t('parent.events.details.eventStartsIn', { text: startsIn })}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('parent.events.details.permissionSectionTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ParentEventDetailsPermissionList
                event={event}
                permissions={permissions}
                dateTimeFmt={dateTimeFmt}
                priceFmt={priceFmt}
                deadlinePassed={deadlinePassed}
                actionsDisabled={inferred === 'cancelled'}
                onApprove={onApprove}
                onDenyOpen={onDenyOpen}
                busyId={busyId}
                busyAction={busyAction}
              />
            </CardContent>
          </Card>

          {event.is_paid && priceNum > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('parent.events.details.paymentCardTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ParentEventDetailsPaymentBlock event={event} permissions={permissions} priceFmt={priceFmt} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
