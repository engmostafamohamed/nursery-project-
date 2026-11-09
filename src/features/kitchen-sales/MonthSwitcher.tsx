import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDay } from '@/lib/datetime';

const shift = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** The month shown (YYYY-MM), with the one before and after; never past `max`. */
export function MonthSwitcher({ month, max, onChange }: { month: string; max: string; onChange: (month: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface p-1" data-testid="month-switcher">
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => onChange(shift(month, -1))} aria-label={t('kitchenSales.month.previous')}>
        <MaterialSymbol name="chevron_left" size="text-lg" className="rtl:rotate-180" />
      </Button>
      <span className="min-w-32 text-center text-sm font-semibold text-on-surface">{formatDay(`${month}-01`, { month: 'long', year: 'numeric' })}</span>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => onChange(shift(month, 1))} disabled={month >= max} aria-label={t('kitchenSales.month.next')}>
        <MaterialSymbol name="chevron_right" size="text-lg" className="rtl:rotate-180" />
      </Button>
      {month !== max ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full px-3" onClick={() => onChange(max)}>{t('kitchenSales.month.thisMonth')}</Button>
      ) : null}
    </div>
  );
}
