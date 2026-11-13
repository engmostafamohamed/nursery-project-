import { useTranslation } from 'react-i18next';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, categoryToneOf, eventTimeRange } from './events';
import type { FamilyEventDraft } from './familyEvent';

/**
 * A family's urgent event as the nursery will see it, kept up to date while the family types, and
 * who is told when it is sent.
 */
export function FamilyEventPreview({ draft, childNames }: { draft: FamilyEventDraft; childNames: string[] }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const title = draft.title.trim();
  const description = draft.description.trim();
  const hasStart = !Number.isNaN(new Date(draft.startsAt).getTime());
  const repeat = draft.repeatsWeekly
    ? summarizeUrgentSchedule({ urgent_days_of_week: draft.days, urgent_hours_of_day: draft.hours, urgent_repeats_weekly: true }, t)
    : null;
  const names = childNames.join(isAr ? '، ' : ', ');

  const line = (icon: string, text: string, className?: string) => (
    <p className={cn('flex items-start gap-2', className)}>
      <MaterialSymbol name={icon} size="text-base" className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );

  return (
    <section aria-label={t('familyEvent.preview.title')} className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm" data-testid="family-event-preview">
      <header className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <MaterialSymbol name="visibility" size="text-lg" className="text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-on-surface">{t('familyEvent.preview.title')}</h2>
          <p className="text-xs text-on-surface-variant">{t('familyEvent.preview.hint')}</p>
        </div>
      </header>
      <div className="space-y-3 p-4">
        <div className="flex gap-3">
          {hasStart ? (
            <EventDateBlock startsAt={draft.startsAt} category={draft.category} locale={locale} />
          ) : (
            <span className={cn('flex h-16 w-14 shrink-0 items-center justify-center rounded-lg', TONE_TINT[categoryToneOf(draft.category)])}>
              <MaterialSymbol name={CATEGORY_ICON[draft.category]} size="text-2xl" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className={cn('break-words text-base font-semibold', title ? 'text-on-surface' : 'text-on-surface-variant')}>
              {title || t(`familyEvent.titlePlaceholder.${draft.category}`)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill tone="error" icon="priority_high">{t('parent.events.urgentBadge')}</StatusPill>
              <StatusPill tone={categoryToneOf(draft.category)} icon={CATEGORY_ICON[draft.category]}>
                {t(`admin.events.create.categories.${draft.category}`)}
              </StatusPill>
            </div>
          </div>
        </div>
        {description ? <p className="line-clamp-3 whitespace-pre-line text-sm text-on-surface-variant">{description}</p> : null}
        <div className="space-y-1.5 text-sm text-on-surface-variant">
          {hasStart ? line('schedule', eventTimeRange(new Date(draft.startsAt).toISOString(), null, locale)) : null}
          {draft.location.trim() ? line('location_on', draft.location.trim()) : null}
          {repeat ? line('event_repeat', repeat, 'font-medium text-error') : null}
          {line('child_care', names || t('familyEvent.preview.noChild'), names ? 'font-medium text-on-surface' : 'text-error')}
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-on-surface" data-testid="family-event-who-is-told">
          <MaterialSymbol name="campaign" size="text-base" className="shrink-0 text-primary" />
          {names ? t('familyEvent.toldNamed', { names }) : t('familyEvent.told')}
        </p>
      </div>
    </section>
  );
}
