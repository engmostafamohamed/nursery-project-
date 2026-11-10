import { useTranslation } from 'react-i18next';

import { useMoney } from '@/features/kitchen-sales/kitchenLook';

import type { HistoryKind, StockMovement } from './kitchen';
import { localName } from '@/lib/bilingualName';

/** How each kind of stock movement looks in the lists. */
export const KIND_LOOK: Record<HistoryKind, { icon: string; tone: string }> = {
  restocked: { icon: 'add_circle', tone: 'text-success' },
  used: { icon: 'remove_circle', tone: 'text-primary' },
  issued: { icon: 'outbox', tone: 'text-primary' },
  spoiled: { icon: 'delete', tone: 'text-error' },
  counted: { icon: 'fact_check', tone: 'text-on-surface-variant' },
  charged: { icon: 'point_of_sale', tone: 'text-primary' },
  returned: { icon: 'undo', tone: 'text-success' },
};

/** What a movement says besides its kind: who it went to or came from, who recorded it, its worth. */
export function useMovementDetails() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  return (m: StockMovement) => {
    const forWhom = localName(m.forAr, m.forEn, isArabic);
    const klass = localName(m.classAr, m.classEn, isArabic);
    const taker = localName(m.takenByAr, m.takenByEn, isArabic);
    return {
      to: [
        forWhom ? t('kitchenSales.history.for', { name: forWhom }) : '',
        klass ? t('stock.history.toClass', { name: klass }) : '',
        taker ? t('stock.history.takenBy', { name: taker }) : '',
        m.supplier ? t('stock.history.from', { name: m.supplier }) : '',
      ].filter(Boolean).join(' · '),
      by: localName(m.byAr, m.byEn, isArabic),
      value: m.value !== null && m.value > 0 ? money(m.value) : '',
    };
  };
}
