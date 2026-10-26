import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { MealShareIcon } from '@/components/daily-reports/MealPlate';
import { MEAL_AMOUNTS, type MealAmount } from '@/lib/dailyReport';
import { mealAmountName } from '@/lib/dailyReportLabels';
import { cn } from '@/lib/utils';

const LAST = MEAL_AMOUNTS.length - 1;

/**
 * How much of a meal the child ate, swiped a quarter of the plate at a time (none → all), with the
 * five amounts under the track to tap instead. Follows the reading direction (right to left in
 * Arabic). Not answered yet (`value` null): a grey thumb at the start; a tap answers it.
 */
export function MealAmountSlider({ label, value, onChange }: { label: string; value: MealAmount | null; onChange: (value: MealAmount) => void }) {
  const { t } = useTranslation();
  const index = value ? MEAL_AMOUNTS.indexOf(value) : 0;
  const pick = (raw: string) => onChange(MEAL_AMOUNTS[Math.min(LAST, Math.max(0, Number(raw)))]);

  return (
    <div className="space-y-1">
      <input
        type="range"
        min={0}
        max={LAST}
        step={1}
        value={index}
        aria-label={label}
        aria-valuetext={value ? mealAmountName(t, value) : t('dailyReport.editor.mealSwipe')}
        data-unset={value === null}
        className="quarter-slider"
        style={{ '--fill': value ? `${(index / LAST) * 100}%` : '0%' } as CSSProperties}
        onChange={(e) => pick(e.target.value)}
        // On an unanswered slider a tap at the start changes nothing, so it answers here.
        onClick={(e) => {
          if (value === null) pick(e.currentTarget.value);
        }}
      />
      {/* The thumb's centre runs from 1rem to the width less 1rem: the labels sit on the same marks. */}
      <div role="radiogroup" aria-label={label} className="relative mx-4 h-11">
        {MEAL_AMOUNTS.map((amount, i) => {
          const selected = amount === value;
          return (
            <button
              key={amount}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(amount)}
              className={cn(
                'absolute top-0 flex w-[4.5rem] -translate-x-1/2 flex-col items-center gap-0.5 rounded-md px-1 py-0.5 text-center text-[11px] font-semibold leading-tight transition-colors rtl:translate-x-1/2 disabled:cursor-not-allowed',
                selected ? 'text-warning' : 'text-on-surface-variant hover:text-on-surface',
              )}
              style={{ insetInlineStart: `${(i / LAST) * 100}%` }}
            >
              <MealShareIcon amount={amount} />
              {mealAmountName(t, amount)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
