import { useWatch, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { useMoney } from '@/hooks/useMoney';
import { localName } from '@/lib/bilingualName';
import { summarizeUrgentSchedule } from '@/lib/eventUrgentSchedule';
import { cn } from '@/lib/utils';

import type { EventFormValues } from './eventFormSchema';
import { CATEGORY_ICON, categoryToneOf, eventTimeRange, type EventCategory, type EventScope } from './events';
import type { EventClassRow } from './useEventFormData';

/** The event as the families will see it, kept up to date while the admin types. */
export function EventPreviewCard({ form, classes }: { form: UseFormReturn<FieldValues>; classes: EventClassRow[] }) {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const isArabic = i18n.language.startsWith('ar');
  const locale = isArabic ? 'ar-EG' : 'en-GB';
  const v = useWatch({ control: form.control }) as Partial<EventFormValues>;
  const title = localName(v.titleAr?.trim(), v.titleEn?.trim(), isArabic);
  const description = localName(v.descriptionAr?.trim(), v.descriptionEn?.trim(), isArabic);
  const category = (v.category ?? 'activity') as EventCategory;
  const start = new Date(v.startsAt ?? '');
  const hasStart = !Number.isNaN(start.getTime());
  const tone = categoryToneOf(category);
  const deadline = v.permissionDeadline ? new Date(v.permissionDeadline) : null;
  const price = v.isPaid && v.price && v.price > 0 ? v.price : 0;
  const urgent = v.isUrgent
    ? summarizeUrgentSchedule({ urgent_days_of_week: v.urgentDaysOfWeek, urgent_hours_of_day: v.urgentHoursOfDay, urgent_repeats_weekly: v.urgentRepeatsWeekly }, t)
    : null;
  const chosenClass = classes.find((c) => c.id === v.targetClassId);
  const scope = (v.targetScope ?? 'all') as EventScope;
  const audience =
    scope === 'all'
      ? t('eventForm.preview.audienceAll')
      : scope === 'class'
        ? chosenClass
          ? t('eventForm.preview.audienceClass', { name: localName(chosenClass.name_ar, chosenClass.name_en, isArabic) })
          : t('eventForm.preview.audienceClassMissing')
        : t('eventForm.preview.audienceChildren', { count: v.targetChildIds?.length ?? 0 });

  const line = (icon: string, text: string, className?: string) => (
    <p className={cn('flex items-start gap-2', className)}>
      <MaterialSymbol name={icon} size="text-base" className="mt-0.5 shrink-0" />
      <span className="min-w-0">{text}</span>
    </p>
  );

  return (
    <section aria-label={t('eventForm.preview.title')} className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
      <header className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <MaterialSymbol name="visibility" size="text-lg" className="text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-on-surface">{t('eventForm.preview.title')}</h2>
          <p className="text-xs text-on-surface-variant">{t('eventForm.preview.hint')}</p>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <div className="flex gap-3">
          <div className={cn('flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg', TONE_TINT[tone])}>
            {hasStart ? (
              <>
                <span className="text-[11px] font-semibold uppercase">{start.toLocaleDateString(locale, { month: 'short' })}</span>
                <span className="text-2xl font-bold leading-none tabular-nums">{start.toLocaleDateString(locale, { day: 'numeric' })}</span>
              </>
            ) : (
              <MaterialSymbol name={CATEGORY_ICON[category]} size="text-2xl" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className={cn('break-words text-base font-semibold', title ? 'text-on-surface' : 'text-on-surface-variant')}>
              {title || t('eventForm.preview.untitled')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {v.isUrgent ? <StatusPill tone="error" icon="priority_high">{t('parent.events.urgentBadge')}</StatusPill> : null}
              <StatusPill tone={tone} icon={CATEGORY_ICON[category]}>{t(`admin.events.create.categories.${category}`)}</StatusPill>
            </div>
          </div>
        </div>

        {description ? <p className="line-clamp-3 whitespace-pre-line text-sm text-on-surface-variant">{description}</p> : null}

        <div className="space-y-1.5 text-sm text-on-surface-variant">
          {hasStart ? line('schedule', eventTimeRange(v.startsAt ?? '', v.endsAt || null, locale)) : null}
          {v.location?.trim() ? line('location_on', v.location.trim()) : null}
          {urgent ? line('event_repeat', urgent, 'font-medium text-error') : null}
          {line(price ? 'payments' : 'money_off', price ? money(price) : t('eventForm.preview.free'), price ? 'font-semibold text-on-surface' : undefined)}
          {line('groups', audience)}
        </div>

        {deadline && !Number.isNaN(deadline.getTime()) ? (
          <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            <MaterialSymbol name="hourglass_top" size="text-base" />
            {t('parent.events.cardDeadline', { date: deadline.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
