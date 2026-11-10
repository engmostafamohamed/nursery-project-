import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { periodBounds, shiftPeriod, type MenuPeriod } from './menuPeriod';

/**
 * Moving between menus: the period before, the current one, the one after. A week reads as its days
 * ("7 – 13 Nov 2026"), a month as its name ("November 2026"). `onChange` gets the new period's first day.
 */
export function PeriodSwitcher({
  period,
  startsOn,
  endsOn,
  today,
  onChange,
}: {
  period: MenuPeriod;
  startsOn: string;
  endsOn: string;
  today: string;
  onChange: (day: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const label = (ymd: string, options: Intl.DateTimeFormatOptions) => new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, options);
  const current = periodBounds(today, period).startsOn;
  const range =
    period === 'month'
      ? label(startsOn, { month: 'long', year: 'numeric' })
      : `${label(startsOn, { day: 'numeric', month: 'short' })} – ${label(endsOn, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const relative =
    startsOn === current
      ? t(`fnb.period.${period}.this`)
      : startsOn === shiftPeriod(current, period, 1)
        ? t(`fnb.period.${period}.next`)
        : startsOn === shiftPeriod(current, period, -1)
          ? t(`fnb.period.${period}.last`)
          : null;

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" aria-label={t(`fnb.period.${period}.previous`)} onClick={() => onChange(shiftPeriod(startsOn, period, -1))}>
        <MaterialSymbol name="chevron_left" size="text-xl" className="rtl:rotate-180" />
      </Button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        <p className="text-sm font-semibold text-on-surface" data-testid="menu-period-range">{range}</p>
        {relative ? <p className="text-xs text-primary">{relative}</p> : null}
      </div>
      <Button type="button" variant="outline" size="icon" aria-label={t(`fnb.period.${period}.following`)} onClick={() => onChange(shiftPeriod(startsOn, period, 1))}>
        <MaterialSymbol name="chevron_right" size="text-xl" className="rtl:rotate-180" />
      </Button>
      {startsOn !== current ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(current)}>
          {t(`fnb.period.${period}.backToThis`)}
        </Button>
      ) : null}
    </div>
  );
}
