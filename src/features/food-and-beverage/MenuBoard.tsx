import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

import { dayLabel, MEAL_LOOK } from './mealLook';
import { MEALS, type Meal } from './menu';

/**
 * The week's menu laid out like a menu board: on a wide screen the days are columns and the meals
 * rows, today's column tinted; on a phone, one day at a time picked from a row of day tabs. The
 * caller fills each day-and-meal cell (dishes to read, or to edit).
 */
export function MenuBoard({ days, today, renderCell }: { days: string[]; today: string; renderCell: (day: string, meal: Meal) => ReactNode }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  return wide ? <WeekGrid days={days} today={today} renderCell={renderCell} /> : <DayPager days={days} today={today} renderCell={renderCell} />;
}

function MealLabel({ meal, compact = false }: { meal: Meal; compact?: boolean }) {
  const { t } = useTranslation();
  const look = MEAL_LOOK[meal];
  return (
    <span className="flex items-center gap-2">
      <span className={cn('flex shrink-0 items-center justify-center rounded-lg', compact ? 'h-7 w-7' : 'h-8 w-8', look.tint)}>
        <MaterialSymbol name={look.icon} size={compact ? 'text-base' : 'text-lg'} />
      </span>
      <span className="text-sm font-semibold text-on-surface">{t(`fnb.meals.${meal}`)}</span>
    </span>
  );
}

function WeekGrid({ days, today, renderCell }: { days: string[]; today: string; renderCell: (day: string, meal: Meal) => ReactNode }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  return (
    <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface shadow-sm">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `9.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="border-b border-outline-variant bg-surface-container-lowest" />
        {days.map((day) => {
          const isToday = day === today;
          return (
            <div key={day} className={cn('border-b border-s border-outline-variant px-3 py-3 text-center', isToday ? 'bg-primary/10' : 'bg-surface-container-lowest')}>
              <p className={cn('text-xs font-medium', isToday ? 'text-primary' : 'text-on-surface-variant')}>{dayLabel(day, locale, { weekday: 'long' })}</p>
              <p className="text-sm font-bold text-on-surface">{dayLabel(day, locale, { day: 'numeric', month: 'short' })}</p>
              {isToday ? <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{t('fnb.view.today')}</span> : null}
            </div>
          );
        })}
        {MEALS.map((meal, row) => (
          <div key={meal} className="contents">
            <div className={cn('flex items-start px-3 py-3', row < MEALS.length - 1 && 'border-b border-outline-variant')}>
              <MealLabel meal={meal} />
            </div>
            {days.map((day) => (
              <div
                key={day}
                data-testid={`menu-cell-${day}-${meal}`}
                className={cn('min-h-[5.5rem] space-y-2 border-s border-outline-variant p-2', row < MEALS.length - 1 && 'border-b', day === today && 'bg-primary/[0.04]')}
              >
                {renderCell(day, meal)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayPager({ days, today, renderCell }: { days: string[]; today: string; renderCell: (day: string, meal: Meal) => ReactNode }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && days.includes(picked) ? picked : days.includes(today) ? today : days[0];
  if (!day) return null;
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t('fnb.view.pickDay')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const selected = d === day;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPicked(d)}
              className={cn(
                'relative flex min-w-[3.6rem] shrink-0 flex-col items-center rounded-2xl border px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
                selected ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-outline-variant bg-surface text-on-surface',
              )}
            >
              <span className={cn('text-[11px] font-medium', selected ? 'text-primary-foreground/90' : 'text-on-surface-variant')}>{dayLabel(d, locale, { weekday: 'short' })}</span>
              <span className="text-lg font-bold leading-6">{dayLabel(d, locale, { day: 'numeric' })}</span>
              {d === today ? <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', selected ? 'bg-primary-foreground' : 'bg-primary')} aria-label={t('fnb.view.today')} /> : null}
            </button>
          );
        })}
      </div>
      <p className="text-sm font-semibold text-on-surface">{dayLabel(day, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div className="space-y-3">
        {MEALS.map((meal) => (
          <section key={meal} className="rounded-2xl border border-outline-variant bg-surface p-3 shadow-sm" aria-label={t(`fnb.meals.${meal}`)}>
            <MealLabel meal={meal} compact />
            <div className="mt-2 space-y-2" data-testid={`menu-cell-${day}-${meal}`}>
              {renderCell(day, meal)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
