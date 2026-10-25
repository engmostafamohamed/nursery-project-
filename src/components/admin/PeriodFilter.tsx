import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FilterChips } from '@/components/ui/FilterChips';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { PeriodState } from '@/hooks/usePeriodState';
import { calendarPeriodLabel, MAX_KPI_RANGE_DAYS, type CustomRangeErrors, type DateRange, type PeriodChoice } from '@/lib/attendancePeriods';
import { cn } from '@/lib/utils';

/**
 * The period of a stats card: chips (today or all time, monthly, quarterly, half-yearly, yearly,
 * from – to), arrows to step back through calendar periods, and the from / to dates.
 */
export function PeriodFilter({ state, choices, onChoose }: { state: PeriodState; choices: PeriodChoice[]; onChoose?: (choice: PeriodChoice) => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          value={state.choice}
          onChange={(choice) => {
            state.choose(choice);
            onChoose?.(choice);
          }}
          label={t('periodFilter.label')}
          options={choices.map((value) => ({ value, label: periodName(t, value) }))}
        />
        {state.calendarChoice && state.calendar ? (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label={t('periodFilter.previous')} onClick={() => state.setOffset((o) => o - 1)}>
              <MaterialSymbol name="chevron_left" className="rtl:rotate-180" />
            </Button>
            <span className="min-w-[9rem] text-center text-sm font-semibold tabular-nums text-on-surface" aria-live="polite">
              {calendarPeriodLabel(state.calendarChoice, state.calendar, locale)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('periodFilter.next')}
              disabled={state.offset >= 0}
              onClick={() => state.setOffset((o) => Math.min(o + 1, 0))}
            >
              <MaterialSymbol name="chevron_right" className="rtl:rotate-180" />
            </Button>
          </div>
        ) : null}
      </div>
      {state.choice === 'custom' ? <CustomRange value={state.custom} errors={state.errors} today={state.today} onChange={state.setCustom} /> : null}
    </div>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function periodName(t: T, period: PeriodChoice): string {
  switch (period) {
    case 'today':
      return t('periodFilter.today');
    case 'all':
      return t('periodFilter.all');
    case 'month':
      return t('periodFilter.month');
    case 'quarter':
      return t('periodFilter.quarter');
    case 'half':
      return t('periodFilter.half');
    case 'year':
      return t('periodFilter.year');
    case 'custom':
      return t('periodFilter.custom');
  }
}

/** From / to dates, checked as they are typed; the message sits under the field it is about. */
function CustomRange({
  value,
  errors,
  today,
  onChange,
}: {
  value: DateRange;
  errors: CustomRangeErrors;
  today: string;
  onChange: (value: DateRange) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const message = (error: CustomRangeErrors['to']) => {
    if (error === 'required') return t('periodFilter.dateRequired');
    if (error === 'fromAfterTo') return t('periodFilter.fromAfterTo');
    if (error === 'rangeTooLong') return t('periodFilter.rangeTooLong', { days: MAX_KPI_RANGE_DAYS });
    return null;
  };
  const field = (key: keyof DateRange, label: string) => {
    const error = message(errors[key]);
    return (
      <div className="space-y-1">
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        <Input
          id={`${id}-${key}`}
          type="date"
          value={value[key]}
          max={today}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-${key}-error` : undefined}
          className={cn(error && invalidFieldClass)}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
        <FieldError id={`${id}-${key}-error`} message={error} />
      </div>
    );
  };
  return (
    <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
      {field('from', t('periodFilter.from'))}
      {field('to', t('periodFilter.to'))}
    </div>
  );
}
