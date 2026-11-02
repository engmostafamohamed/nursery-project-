import { useTranslation } from 'react-i18next';

import { formatMoneyAmount } from '@/lib/money';

/** An amount as "EGP 1,250" in the current language; null counts as 0. */
export function useMoney() {
  const { t } = useTranslation();
  return (amount: number | null) => t('invoice.egpAmount', { amount: formatMoneyAmount(Number(amount ?? 0)) });
}
