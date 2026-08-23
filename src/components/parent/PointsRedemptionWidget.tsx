import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  enabled: boolean;
  balance: number;
  invoiceAmount: number;
  rate: number;
  minPoints: number;
  maxDiscountPercent: number;
  onRedeem: (points: number, discountEgp: number) => Promise<void>;
};

export function PointsRedemptionWidget({ enabled, balance, invoiceAmount, rate, minPoints, maxDiscountPercent, onRedeem }: Props) {
  const { t } = useTranslation();
  const [points, setPoints] = useState(0);
  const maxDiscount = invoiceAmount * maxDiscountPercent;
  const maxByDiscount = rate > 0 ? Math.floor(maxDiscount / rate) : 0;
  const maxRedeemablePoints = Math.max(0, Math.min(balance, maxByDiscount));
  const discount = useMemo(() => Math.max(0, points * rate), [points, rate]);
  const invalid = points < minPoints || points > maxRedeemablePoints;

  if (!enabled) return null;

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="text-sm font-semibold">{t('loyalty.redeemTitle')}</h3>
      <p className="text-xs text-on-surface-variant">{t('loyalty.currentPoints')}: {balance}</p>
      <p className="text-xs text-on-surface-variant">{t('loyalty.redemptionRate', { points: 1, egp: rate.toFixed(2) })}</p>
      <Input className="mt-2" type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value || 0))} />
      <p className="mt-1 text-xs text-on-surface-variant">{t('loyalty.discountValue')}: {discount.toFixed(2)} EGP</p>
      <Button className="mt-2 w-full" disabled={invalid} onClick={() => void onRedeem(points, discount)}>
        {t('loyalty.applyRedemption')}
      </Button>
    </section>
  );
}
