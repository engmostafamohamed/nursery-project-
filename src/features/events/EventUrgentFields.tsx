import { Controller, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { FieldError } from '@/components/ui/FieldError';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { formatUrgentHour, sortUniqueNumbers, URGENT_EVENT_DAY_KEYS, URGENT_EVENT_HOURS } from '@/lib/eventUrgentSchedule';
import { cn } from '@/lib/utils';

/** When an urgent event is put first for the families: the days, the hours, and every week or once. */
export function EventUrgentFields({ form, errorOf }: { form: UseFormReturn<FieldValues>; errorOf: (name: string) => string | null }) {
  const { t } = useTranslation();
  const { watch, setValue, control } = form;
  const days = sortUniqueNumbers(watch('urgentDaysOfWeek') as number[] | undefined);
  const hours = sortUniqueNumbers(watch('urgentHoursOfDay') as number[] | undefined);
  const set = (name: string, value: number[]) => setValue(name, value, { shouldValidate: true, shouldDirty: true });

  return (
    <div className="space-y-4 rounded-xl border border-error/20 bg-error/5 p-3">
      <div className="space-y-2">
        <p className="text-xs font-medium text-on-surface-variant">{t('admin.events.create.fields.urgentDays')}</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {URGENT_EVENT_DAY_KEYS.map((dayKey, day) => {
            const on = days.includes(day);
            return (
              <button
                key={dayKey}
                type="button"
                aria-pressed={on}
                onClick={() => set('urgentDaysOfWeek', on ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b))}
                className={cn(
                  'rounded-xl border px-2 py-2 text-xs font-semibold transition-colors',
                  on ? 'border-error bg-error text-white' : 'border-outline-variant bg-surface text-on-surface-variant hover:border-error/40 hover:bg-error/10',
                )}
              >
                {t(`reminders.daysShort.${dayKey}`)}
              </button>
            );
          })}
        </div>
        <FieldError message={errorOf('urgentDaysOfWeek')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-urgent-hour">{t('admin.events.create.fields.urgentHours')}</Label>
        <Select
          id="event-urgent-hour"
          value=""
          onChange={(e) => {
            const hour = Number(e.target.value);
            if (e.target.value !== '' && !hours.includes(hour)) set('urgentHoursOfDay', [...hours, hour].sort((a, b) => a - b));
          }}
        >
          <option value="">{t('admin.events.create.placeholders.selectUrgentHour')}</option>
          {URGENT_EVENT_HOURS.map((hour) => (
            <option key={hour} value={hour} disabled={hours.includes(hour)}>{formatUrgentHour(hour)}</option>
          ))}
        </Select>
        {hours.length ? (
          <div className="flex flex-wrap gap-2">
            {hours.map((hour) => (
              <span key={hour} className="inline-flex items-center gap-1.5 rounded-full bg-error/10 py-1 pe-1.5 ps-2.5 text-xs font-semibold text-error" dir="ltr">
                {formatUrgentHour(hour)}
                <button
                  type="button"
                  aria-label={t('admin.events.create.removeUrgentHour')}
                  onClick={() => set('urgentHoursOfDay', hours.filter((h) => h !== hour))}
                  className="inline-flex items-center justify-center rounded-full text-error/70 hover:bg-error/15 hover:text-error"
                >
                  <MaterialSymbol name="close" size="text-sm" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-on-surface-variant">{t('admin.events.create.noUrgentHoursYet')}</p>
        )}
        <FieldError message={errorOf('urgentHoursOfDay')} />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant bg-surface p-3">
        <Controller control={control} name="urgentRepeatsWeekly" render={({ field }) => <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />} />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-on-surface">{t('admin.events.create.fields.urgentRepeatsWeekly')}</span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">{t('admin.events.create.hints.urgentRepeatsWeekly')}</span>
        </span>
      </label>
    </div>
  );
}
