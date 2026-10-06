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
  /** A redemption is in progress: the button stays disabled until it finishes. */
  busy?: boolean;
  onRedeem: (points: number, discountEgp: number) => Promise<void>;
};

export function PointsRedemptionWidget({ enabled, balance, invoiceAmount, rate, minPoints, maxDiscountPercent, busy, onRedeem }: Props) {
  const { t } = useTranslation();
  const [points, setPoints] = useState(0);
  const maxDiscount = invoiceAmount * maxDiscountPercent;
  const maxByDiscount = rate > 0 ? Math.floor(maxDiscount / rate) : 0;
  const maxRedeemablePoints = Math.max(0, Math.min(balance, maxByDiscount));
  const discount = useMemo(() => Math.max(0, points * rate), [points, rate]);
  const invalid = !Number.isInteger(points) || points < minPoints || points > maxRedeemablePoints;
  const error =
    points === 0
      ? null
      : points < minPoints
        ? t('loyalty.errors.minPoints', { count: minPoints })
        : points > maxRedeemablePoints
          ? t('loyalty.errors.maxPoints', { count: maxRedeemablePoints })
          : null;

  if (!enabled) return null;

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="text-sm font-semibold">{t('loyalty.redeemTitle')}</h3>
      <p className="text-xs text-on-surface-variant">{t('loyalty.currentPoints')}: {balance}</p>
      <p className="text-xs text-on-surface-variant">{t('loyalty.redemptionRate', { points: 1, egp: rate.toFixed(2) })}</p>
      <Input
        className="mt-2"
        type="number"
        min={0}
        step={1}
        value={points}
        aria-invalid={Boolean(error)}
        onChange={(e) => setPoints(Number(e.target.value || 0))}
      />
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
      <p className="mt-1 text-xs text-on-surface-variant">
        {t('loyalty.discountValue')}: {t('invoice.egpAmount', { amount: discount.toFixed(2) })}
      </p>
      <Button
        className="mt-2 w-full"
        disabled={invalid || busy}
        aria-busy={busy}
        onClick={() => void onRedeem(points, discount).then(() => setPoints(0))}
      >
        {busy ? t('payment.submitting') : t('loyalty.applyRedemption')}
      </Button>
    </section>
  );
}
