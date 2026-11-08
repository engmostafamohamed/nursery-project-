import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { addDays } from './menu';

/** Moving between weeks: the one before, this week, the one after. */
export function WeekSwitcher({ weekStart, thisWeek, onChange }: { weekStart: string; thisWeek: string; onChange: (weekStart: string) => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const label = (ymd: string, options: Intl.DateTimeFormatOptions) => new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, options);
  const range = `${label(weekStart, { day: 'numeric', month: 'short' })} – ${label(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const relative = weekStart === thisWeek ? t('fnb.week.this') : weekStart === addDays(thisWeek, 7) ? t('fnb.week.next') : weekStart === addDays(thisWeek, -7) ? t('fnb.week.last') : null;

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" aria-label={t('fnb.week.previous')} onClick={() => onChange(addDays(weekStart, -7))}>
        <MaterialSymbol name="chevron_left" size="text-xl" className="rtl:rotate-180" />
      </Button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        <p className="text-sm font-semibold text-on-surface" data-testid="menu-week-range">{range}</p>
        {relative ? <p className="text-xs text-primary">{relative}</p> : null}
      </div>
      <Button type="button" variant="outline" size="icon" aria-label={t('fnb.week.following')} onClick={() => onChange(addDays(weekStart, 7))}>
        <MaterialSymbol name="chevron_right" size="text-xl" className="rtl:rotate-180" />
      </Button>
      {weekStart !== thisWeek ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(thisWeek)}>
          {t('fnb.week.backToThis')}
        </Button>
      ) : null}
    </div>
  );
}
