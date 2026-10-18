import type { TFunction } from 'i18next';

import { formatMoneyAmount } from '@/lib/money';

/** "10% off" / "EGP 55.00 off" in the current language. */
export function dealDiscountLabel(
  t: TFunction,
  deal: { discount_type: 'percentage' | 'fixed_amount'; discount_value: number },
): string {
  return deal.discount_type === 'percentage'
    ? t('deals.percentOff', { value: deal.discount_value })
    : t('deals.amountOff', { amount: t('invoice.egpAmount', { amount: formatMoneyAmount(deal.discount_value) }) });
}

/** The row's name in the current language, falling back to the other one. */
export function localizedName(row: { name_ar: string | null; name_en: string | null }, isAr: boolean): string {
  return (isAr ? row.name_ar || row.name_en : row.name_en || row.name_ar) ?? '';
}
