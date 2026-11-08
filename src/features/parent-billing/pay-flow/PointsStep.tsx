import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

import { pointsDiscount, pointsError, type PointsLimits } from '../parentBilling';

/**
 * Using points before paying: the balance, how many can go on this invoice, and the discount they
 * give. Applying is final (the invoice amount goes down at once), so it has its own button; the
 * parent may also skip it.
 */
export function PointsStep({
  balance,
  limits,
  appliedDiscount,
  applying,
  onApply,
}: {
  balance: number;
  limits: PointsLimits;
  /** Discount already taken off in this visit, shown after applying. */
  appliedDiscount: number;
  applying: boolean;
  onApply: (points: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const count = (n: number) => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB').format(n);
  const [text, setText] = useState('');
  const points = Number(text);
  const error = text === '' ? null : pointsError(points, limits);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MaterialSymbol name="workspace_premium" size="text-xl" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-on-surface">{t('parentBilling.points.balance', { points: count(balance) })}</p>
          <p className="text-on-surface-variant">{t('parentBilling.points.rate', { amount: money(limits.rate) })}</p>
        </div>
      </div>

      {appliedDiscount > 0 ? (
        <p role="status" className="flex items-center gap-1.5 rounded-xl border border-success/40 bg-success/10 p-3 text-sm font-medium text-success">
          <MaterialSymbol name="check_circle" size="text-base" />
          {t('parentBilling.points.applied', { amount: money(appliedDiscount) })}
        </p>
      ) : null}

      {limits.usable ? (
        <div className="space-y-2">
          <Label htmlFor="pay-points">{t('parentBilling.points.howMany', { min: count(limits.minPoints), max: count(limits.maxPoints) })}</Label>
          <div className="flex gap-2">
            <Input
              id="pay-points"
              inputMode="numeric"
              value={text}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'pay-points-error' : 'pay-points-value'}
              className={cn('flex-1', error && 'border-error')}
              onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
            />
            <Button type="button" variant="outline" onClick={() => setText(String(limits.maxPoints))}>
              {t('parentBilling.points.useMost')}
            </Button>
          </div>
          {error ? (
            <p id="pay-points-error" role="alert" className="text-xs text-error">
              {t(`parentBilling.points.errors.${error}`, { min: count(limits.minPoints), max: count(limits.maxPoints) })}
            </p>
          ) : text ? (
            <p id="pay-points-value" className="text-xs text-on-surface-variant">
              {t('parentBilling.points.discountIs', { amount: money(pointsDiscount(points, limits.rate)) })}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={!text || error !== null || applying}
            aria-busy={applying}
            onClick={() => onApply(points)}
          >
            <MaterialSymbol name="redeem" size="text-lg" />
            {applying ? t('payment.submitting') : t('parentBilling.points.apply', { amount: money(pointsDiscount(points || 0, limits.rate)) })}
          </Button>
          <p className="text-xs text-on-surface-variant">{t('parentBilling.points.final')}</p>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">{t('parentBilling.points.notEnough', { min: count(limits.minPoints) })}</p>
      )}
    </div>
  );
}
