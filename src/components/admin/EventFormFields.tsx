import { Controller, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  formatUrgentHour,
  sortUniqueNumbers,
  URGENT_EVENT_DAY_KEYS,
  URGENT_EVENT_HOURS,
} from '@/lib/eventUrgentSchedule';
import { EVENT_EDIT_STATUSES } from '@/pages/admin/eventFormSchema';

export type EventClassRow = { id: string; name_ar: string; name_en: string };

export type EventChildPickerRow = { id: string; full_name_ar: string; full_name_en: string };

const CATEGORIES = ['trip', 'activity', 'service', 'doctor_visit'] as const;

type EventFormFieldsProps = {
  form: UseFormReturn<FieldValues>;
  showAr: boolean;
  showEn: boolean;
  showStatusSelect: boolean;
  classes: EventClassRow[];
  classesLoading: boolean;
  nurseryChildren?: EventChildPickerRow[];
  childrenLoading?: boolean;
  statusFieldId?: string;
};

export function EventFormFields({
  form,
  showAr,
  showEn,
  showStatusSelect,
  classes,
  classesLoading,
  nurseryChildren = [],
  childrenLoading = false,
  statusFieldId = 'event-edit-status',
}: EventFormFieldsProps) {
  const { t, i18n } = useTranslation();
  const { register, watch, control, formState, setValue } = form;
  const targetScope = String(watch('targetScope') ?? '');
  const isPaid = Boolean(watch('isPaid'));
  const isUrgent = Boolean(watch('isUrgent'));
  const targetChildIds = (watch('targetChildIds') as string[] | undefined) ?? [];
  const urgentDays = sortUniqueNumbers(watch('urgentDaysOfWeek') as number[] | undefined);
  const urgentHours = sortUniqueNumbers(watch('urgentHoursOfDay') as number[] | undefined);

  const classLabel = (row: EventClassRow) =>
    i18n.language.startsWith('ar') ? row.name_ar || row.name_en : row.name_en || row.name_ar;

  const childLabel = (row: EventChildPickerRow) =>
    i18n.language.startsWith('ar') ? row.full_name_ar || row.full_name_en : row.full_name_en || row.full_name_ar;

  const toggleChild = (id: string) => {
    const set = new Set(targetChildIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setValue('targetChildIds', [...set], { shouldValidate: true, shouldDirty: true });
  };

  const toggleUrgentDay = (day: number) => {
    const next = urgentDays.includes(day)
      ? urgentDays.filter((d) => d !== day)
      : [...urgentDays, day].sort((a, b) => a - b);
    setValue('urgentDaysOfWeek', next, { shouldValidate: true, shouldDirty: true });
  };

  const addUrgentHour = (hour: number) => {
    if (urgentHours.includes(hour)) return;
    setValue('urgentHoursOfDay', [...urgentHours, hour].sort((a, b) => a - b), {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const removeUrgentHour = (hour: number) => {
    setValue('urgentHoursOfDay', urgentHours.filter((h) => h !== hour), {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const firstError = Object.values(formState.errors)[0]?.message;

  return (
    <>
      {showStatusSelect ? (
        <div className="space-y-2">
          <Label htmlFor={statusFieldId}>{t('admin.events.edit.fields.eventStatus')}</Label>
          <Select id={statusFieldId} {...register('eventStatus')}>
            {EVENT_EDIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.events.edit.statusOptions.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {showAr ? (
        <div className="space-y-2">
          <Label htmlFor="event-title-ar">{t('admin.events.create.fields.titleAr')}</Label>
          <Input id="event-title-ar" autoComplete="off" {...register('titleAr')} />
        </div>
      ) : null}
      {showEn ? (
        <div className="space-y-2">
          <Label htmlFor="event-title-en">{t('admin.events.create.fields.titleEn')}</Label>
          <Input id="event-title-en" autoComplete="off" {...register('titleEn')} />
        </div>
      ) : null}

      {showAr ? (
        <div className="space-y-2">
          <Label htmlFor="event-desc-ar">{t('admin.events.create.fields.descriptionAr')}</Label>
          <Textarea id="event-desc-ar" rows={3} {...register('descriptionAr')} />
        </div>
      ) : null}
      {showEn ? (
        <div className="space-y-2">
          <Label htmlFor="event-desc-en">{t('admin.events.create.fields.descriptionEn')}</Label>
          <Textarea id="event-desc-en" rows={3} {...register('descriptionEn')} />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="event-starts">{t('admin.events.create.fields.startsAt')}</Label>
        <Input id="event-starts" type="datetime-local" {...register('startsAt')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-location">{t('admin.events.create.fields.location')}</Label>
        <Input id="event-location" autoComplete="off" {...register('location')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-category">{t('admin.events.create.fields.category')}</Label>
        <Select id="event-category" {...register('category')}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`admin.events.create.categories.${c}`)}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-on-surface">{t('admin.events.create.fields.targetScope')}</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
            <input type="radio" value="all" className="h-4 w-4 accent-secondary" {...register('targetScope')} />
            {t('admin.events.create.scope.all')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
            <input type="radio" value="class" className="h-4 w-4 accent-secondary" {...register('targetScope')} />
            {t('admin.events.create.scope.class')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
            <input type="radio" value="individual" className="h-4 w-4 accent-secondary" {...register('targetScope')} />
            {t('admin.events.create.scope.individual')}
          </label>
        </div>
        {targetScope === 'individual' ? (
          <p className="text-xs text-on-surface-variant">{t('admin.events.create.scope.individualHint')}</p>
        ) : null}
      </fieldset>

      {targetScope === 'individual' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">{t('admin.events.create.fields.targetChildren')}</p>
          {childrenLoading ? (
            <p className="text-xs text-on-surface-variant">{t('admin.events.create.loadingChildren')}</p>
          ) : nurseryChildren.length === 0 ? (
            <p className="text-xs text-on-surface-variant">{t('admin.events.create.noChildrenInNursery')}</p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-outline-variant p-3">
              {nurseryChildren.map((ch) => (
                <li key={ch.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
                    <Checkbox
                      checked={targetChildIds.includes(ch.id)}
                      onCheckedChange={() => toggleChild(ch.id)}
                    />
                    <span>{childLabel(ch)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {targetScope === 'class' ? (
        <div className="space-y-2">
          <Label htmlFor="event-class">{t('admin.events.create.fields.targetClass')}</Label>
          <Select id="event-class" disabled={classesLoading} {...register('targetClassId')}>
            <option value="">{t('admin.events.create.placeholders.selectClass')}</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {classLabel(row)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-error/30 bg-error-container/30 p-3">
        <Controller
          control={control}
          name="isUrgent"
          render={({ field }) => (
            <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
          )}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-error">{t('admin.events.create.fields.isUrgent')}</span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">
            {t('admin.events.create.hints.isUrgent')}
          </span>
        </span>
      </label>

      {isUrgent ? (
        <div className="space-y-3 rounded-2xl border border-error/20 bg-error-container/10 p-3">
          <div>
            <p className="text-sm font-semibold text-on-surface">
              {t('admin.events.create.fields.urgentSchedule')}
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {t('admin.events.create.hints.urgentSchedule')}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-on-surface-variant">
              {t('admin.events.create.fields.urgentDays')}
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {URGENT_EVENT_DAY_KEYS.map((dayKey, day) => {
                const checked = urgentDays.includes(day);
                return (
                  <button
                    key={dayKey}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleUrgentDay(day)}
                    className={
                      'rounded-xl border px-2 py-2 text-xs font-medium transition-colors ' +
                      (checked
                        ? 'border-error bg-error text-white'
                        : 'border-outline-variant bg-surface text-on-surface-variant hover:border-error/40 hover:bg-error-container/20')
                    }
                  >
                    {t(`reminders.daysShort.${dayKey}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-urgent-hour">{t('admin.events.create.fields.urgentHours')}</Label>
            <Select
              id="event-urgent-hour"
              value=""
              onChange={(e) => {
                if (e.target.value !== '') addUrgentHour(Number(e.target.value));
              }}
            >
              <option value="">{t('admin.events.create.placeholders.selectUrgentHour')}</option>
              {URGENT_EVENT_HOURS.map((hour) => (
                <option key={hour} value={hour} disabled={urgentHours.includes(hour)}>
                  {formatUrgentHour(hour)}
                </option>
              ))}
            </Select>
            {urgentHours.length ? (
              <div className="flex flex-wrap gap-2">
                {urgentHours.map((hour) => (
                  <span
                    key={hour}
                    className="inline-flex items-center gap-1.5 rounded-full bg-error/10 py-1 pe-1.5 ps-2.5 text-xs font-semibold text-error"
                  >
                    {formatUrgentHour(hour)}
                    <button
                      type="button"
                      aria-label={t('admin.events.create.removeUrgentHour')}
                      onClick={() => removeUrgentHour(hour)}
                      className="inline-flex items-center justify-center rounded-full text-error/70 hover:bg-error/15 hover:text-error"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden>
                        close
                      </span>
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">
                {t('admin.events.create.noUrgentHoursYet')}
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant bg-surface p-3">
            <Controller
              control={control}
              name="urgentRepeatsWeekly"
              render={({ field }) => (
                <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
              )}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-on-surface">
                {t('admin.events.create.fields.urgentRepeatsWeekly')}
              </span>
              <span className="mt-0.5 block text-xs text-on-surface-variant">
                {t('admin.events.create.hints.urgentRepeatsWeekly')}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center gap-2">
        <Controller
          control={control}
          name="isPaid"
          render={({ field }) => (
            <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
          )}
        />
        <span className="text-sm text-on-surface">{t('admin.events.create.fields.isPaid')}</span>
      </label>

      {isPaid ? (
        <div className="space-y-2">
          <Label htmlFor="event-price">{t('admin.events.create.fields.priceEgp')}</Label>
          <Input
            id="event-price"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            {...register('price', { valueAsNumber: true })}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="event-deadline">{t('admin.events.create.fields.permissionDeadline')}</Label>
        <Input id="event-deadline" type="datetime-local" {...register('permissionDeadline')} />
        <p className="text-xs text-on-surface-variant">{t('admin.events.create.hints.permissionDeadline')}</p>
      </div>

      {firstError ? (
        <p className="text-sm text-error" role="alert">
          {t(`admin.events.errors.${String(firstError)}`, { defaultValue: t('admin.events.errors.unknown') })}
        </p>
      ) : null}
    </>
  );
}
