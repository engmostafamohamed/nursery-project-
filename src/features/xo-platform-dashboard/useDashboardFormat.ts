import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMoneyAmount } from '@/lib/money';

import { monthStart } from './platformDashboard';

/** Number, money, month and day formats for the platform dashboard, in the page's language. */
export function useDashboardFormat() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const rtl = i18n.dir() === 'rtl';

  return useMemo(() => {
    const locale = isAr ? 'ar-EG' : 'en-GB';
    const intFormat = new Intl.NumberFormat(locale);
    const compactFormat = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    const percentFormat = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
    return {
      isAr,
      rtl,
      locale,
      int: (n: number) => intFormat.format(n),
      compact: (n: number) => compactFormat.format(n),
      /** n is already a percentage (93.2 → "93.2%"). */
      percent: (n: number) => percentFormat.format(n / 100),
      money: (n: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(n) }),
      monthShort: (month: string) => monthStart(month).toLocaleDateString(locale, { month: 'short' }),
      monthLong: (month: string) => monthStart(month).toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      day: (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, options),
      nurseryName: (row: { name_ar: string; name_en: string }) =>
        (isAr ? row.name_ar || row.name_en : row.name_en || row.name_ar) || '—',
    };
  }, [isAr, rtl, t]);
}

export type DashboardFormat = ReturnType<typeof useDashboardFormat>;
