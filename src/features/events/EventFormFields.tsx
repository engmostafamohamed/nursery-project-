import { Controller, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { EventAudienceFields } from './EventAudienceFields';
import { EventCategoryPicker } from './EventCategoryPicker';
import { EventFormSection } from './EventFormSection';
import type { EventCategory, EventStage } from './events';
import { EventUrgentFields } from './EventUrgentFields';
import type { EventChildPickerRow, EventClassRow } from './useEventFormData';

/**
 * The event form, in parts: (on edit) what to do with it next, what the event is, when, who is
 * invited, whether families pay, and whether it is urgent. Each field shows its own problem.
 */
export function EventFormFields({ form, showAr, showEn, stageOptions, classes, classesLoading, nurseryChildren, childrenLoading }: {
  form: UseFormReturn<FieldValues>;
  showAr: boolean;
  showEn: boolean;
  /** On edit: the steps the event may take next (see editStageOptions). */
  stageOptions?: EventStage[];
  classes: EventClassRow[];
  classesLoading: boolean;
  nurseryChildren: EventChildPickerRow[];
  childrenLoading: boolean;
}) {
  const { t } = useTranslation();
  const { register, watch, setValue, control, formState } = form;
  const isPaid = Boolean(watch('isPaid'));
  const isUrgent = Boolean(watch('isUrgent'));
  const errorOf = (name: string): string | null => {
    const code = formState.errors[name]?.message;
    return code ? t(`admin.events.errors.${String(code)}`, { defaultValue: t('admin.events.errors.unknown') }) : null;
  };
  const field = (name: string) => ({ 'aria-invalid': Boolean(errorOf(name)), className: cn(errorOf(name) && invalidFieldClass) });

  return (
    <div className="space-y-4">
      {stageOptions && stageOptions.length > 1 ? (
        <EventFormSection icon="flag" title={t('eventForm.sections.stage.title')} hint={t('eventForm.sections.stage.hint')}>
          <FormField id="event-edit-status" label={t('admin.events.edit.fields.eventStatus')}>
            <Select id="event-edit-status" {...register('eventStatus')}>
              {stageOptions.map((s) => (
                <option key={s} value={s}>{t(`admin.events.edit.statusOptions.${s}`)}</option>
              ))}
            </Select>
          </FormField>
        </EventFormSection>
      ) : null}

      <EventFormSection icon="edit_note" title={t('eventForm.sections.about.title')} hint={t('eventForm.sections.about.hint')}>
        <div className={cn('grid gap-4', showAr && showEn && 'sm:grid-cols-2')}>
          {showAr ? (
            <FormField id="event-title-ar" label={t('admin.events.create.fields.titleAr')} error={errorOf('titleAr')}>
              <Input id="event-title-ar" dir="rtl" autoComplete="off" {...field('titleAr')} {...register('titleAr')} />
            </FormField>
          ) : null}
          {showEn ? (
            <FormField id="event-title-en" label={t('admin.events.create.fields.titleEn')} error={showAr ? null : errorOf('titleAr')}>
              <Input id="event-title-en" dir="ltr" autoComplete="off" {...register('titleEn')} />
            </FormField>
          ) : null}
          {showAr ? (
            <FormField id="event-desc-ar" label={t('admin.events.create.fields.descriptionAr')}>
              <Textarea id="event-desc-ar" dir="rtl" rows={3} {...register('descriptionAr')} />
            </FormField>
          ) : null}
          {showEn ? (
            <FormField id="event-desc-en" label={t('admin.events.create.fields.descriptionEn')}>
              <Textarea id="event-desc-en" dir="ltr" rows={3} {...register('descriptionEn')} />
            </FormField>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">{t('admin.events.create.fields.category')}</p>
          <EventCategoryPicker value={watch('category') as EventCategory} onChange={(c) => setValue('category', c, { shouldDirty: true })} />
        </div>
        <FormField id="event-location" label={t('admin.events.create.fields.location')}>
          <Input id="event-location" autoComplete="off" placeholder={t('eventForm.locationPlaceholder')} {...register('location')} />
        </FormField>
      </EventFormSection>

      <EventFormSection icon="schedule" title={t('eventForm.sections.when.title')} hint={t('eventForm.sections.when.hint')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="event-starts" label={t('admin.events.create.fields.startsAt')} error={errorOf('startsAt')}>
            <Input id="event-starts" type="datetime-local" {...field('startsAt')} {...register('startsAt')} />
          </FormField>
          <FormField id="event-ends" label={t('eventForm.endsAt')} hint={t('eventForm.endsAtHint')} error={errorOf('endsAt')} optional>
            <Input id="event-ends" type="datetime-local" {...field('endsAt')} {...register('endsAt')} />
          </FormField>
        </div>
        <FormField id="event-deadline" label={t('admin.events.create.fields.permissionDeadline')} hint={t('admin.events.create.hints.permissionDeadline')} error={errorOf('permissionDeadline')}>
          <Input id="event-deadline" type="datetime-local" {...field('permissionDeadline')} {...register('permissionDeadline')} />
        </FormField>
      </EventFormSection>

      <EventFormSection icon="groups" title={t('eventForm.sections.who.title')} hint={t('eventForm.sections.who.hint')}>
        <EventAudienceFields
          form={form}
          classes={classes}
          classesLoading={classesLoading}
          nurseryChildren={nurseryChildren}
          childrenLoading={childrenLoading}
          errorOf={errorOf}
        />
      </EventFormSection>

      <EventFormSection icon="payments" tone="success" title={t('eventForm.sections.fee.title')} hint={t('eventForm.sections.fee.hint')}>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant bg-surface p-3">
          <Controller control={control} name="isPaid" render={({ field: f }) => <Checkbox checked={Boolean(f.value)} onCheckedChange={(v) => f.onChange(v === true)} />} />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-on-surface">{t('eventForm.paidLabel')}</span>
            <span className="mt-0.5 block text-xs text-on-surface-variant">{t('eventForm.paidHint')}</span>
          </span>
        </label>
        {isPaid ? (
          <FormField id="event-price" label={t('admin.events.create.fields.priceEgp')} error={errorOf('price')} className="max-w-xs">
            <Input id="event-price" type="number" min="0.01" step="0.01" inputMode="decimal" dir="ltr" {...field('price')} {...register('price', { valueAsNumber: true })} />
          </FormField>
        ) : null}
      </EventFormSection>

      <EventFormSection icon="priority_high" tone="error" title={t('eventForm.sections.urgent.title')} hint={t('admin.events.create.hints.isUrgent')}>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant bg-surface p-3">
          <Controller control={control} name="isUrgent" render={({ field: f }) => <Checkbox checked={Boolean(f.value)} onCheckedChange={(v) => f.onChange(v === true)} />} />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-on-surface">{t('admin.events.create.fields.isUrgent')}</span>
            <span className="mt-0.5 block text-xs text-on-surface-variant">{t('admin.events.create.hints.urgentSchedule')}</span>
          </span>
        </label>
        {isUrgent ? <EventUrgentFields form={form} errorOf={errorOf} /> : null}
      </EventFormSection>
    </div>
  );
}
