import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { partnerName } from '@/features/discounts/discountLook';
import { billingPeriodName, type OrderDiscount, type SignupOrder } from '@/features/parent-signup/signupOrder';
import type { ApplicationPackageBillingPeriod } from '@/hooks/useApplicationPackagePayment';
import { formatMoneyAmount } from '@/lib/money';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { AnimatedAmount } from './AnimatedAmount';


type Props = {
  order: SignupOrder;
  billingPeriod: ApplicationPackageBillingPeriod;
  /** The nursery's hourly rate for extra time not covered by a package. */
  hourlyRate: number | null;
  /** Packages step: the total counts as the parent picks. */
  live?: boolean;
  /** Payment step: a way back to change the packages. */
  onChange?: () => void;
  className?: string;
};

/** One discount line: whose (the deal's or the partner's name), and "limited" when the cap cut it. */
function DiscountLines({ lines }: { lines: OrderDiscount[] }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  return (
    <>
      {lines.map((line) => (
        <div key={line.source} className="flex justify-between gap-3 text-success">
          <dt className="min-w-0">
            {line.source === 'partnership'
              ? t('discounts.signup.partnerLine', { partner: localName(line.nameAr, line.nameEn, isArabic) })
              : localName(line.nameAr, line.nameEn, isArabic) || t('signup.payment.discount')}
            {line.capped ? <span className="block text-[11px] text-on-surface-variant">{t('discounts.signup.capped')}</span> : null}
          </dt>
          <dd className="shrink-0 tabular-nums">−{money(line.amount)}</dd>
        </div>
      ))}
    </>
  );
}

/** What the parent is about to pay, line by line, with the total due now. */
export function SignupOrderSummary({ order, billingPeriod, hourlyRate, live = false, onChange, className }: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const { tuition, tuitionPackage, extraHours, extraHoursPackage, expectedPartner } = order;

  return (
    <div className={cn('rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MaterialSymbol name={live ? 'calculate' : 'receipt_long'} />
          </span>
          <div className="min-w-0">
            <h4 className="font-semibold text-on-surface">{live ? t('signup.packages.summaryTitle') : t('signup.packages.orderTitle')}</h4>
            <p className="text-xs text-on-surface-variant">
              {live ? t('signup.packages.summaryLive') : t('signup.payment.pricesIncludeDiscounts')}
            </p>
          </div>
        </div>
        {onChange ? (
          <Button type="button" variant="outline" size="sm" onClick={onChange}>
            <MaterialSymbol name="edit" size="text-base" />
            {t('signup.packages.change')}
          </Button>
        ) : null}
      </div>

      {tuition && tuitionPackage ? (
        <dl className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="min-w-0 text-on-surface-variant">
              <span className="block font-medium text-on-surface">{localName(tuitionPackage.nameAr, tuitionPackage.nameEn, isArabic)}</span>
              <span className="mt-0.5 block text-xs">{billingPeriodName(t, billingPeriod)}</span>
            </dt>
            <dd className="shrink-0 text-end font-medium tabular-nums text-on-surface">{money(tuition.subtotal)}</dd>
          </div>
          <DiscountLines lines={order.tuitionDiscounts} />

          {extraHours && extraHoursPackage ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <dt className="min-w-0 text-on-surface-variant">
                  <span className="block font-medium text-on-surface">{localName(extraHoursPackage.nameAr, extraHoursPackage.nameEn, isArabic)}</span>
                  <span className="mt-0.5 block text-xs">{t('applications.extraHoursPackage.title')}</span>
                </dt>
                <dd className="shrink-0 text-end font-medium tabular-nums text-on-surface">{money(extraHours.price)}</dd>
              </div>
              <DiscountLines lines={order.extraHoursDiscounts} />
            </>
          ) : (
            // No package: extra time is billed later at the hourly rate, not paid now.
            <div className="flex items-start justify-between gap-3">
              <dt className="min-w-0 text-on-surface-variant">{t('applications.extraHoursPackage.title')}</dt>
              <dd className="shrink-0 text-end text-xs font-medium text-on-surface-variant">
                {hourlyRate !== null
                  ? t('applications.extraHoursPackage.hourlyBilledLater', { rate: money(hourlyRate) })
                  : t('applications.extraHoursPackage.payPerHourBilledLater')}
              </dd>
            </div>
          )}

          <div className="border-t border-outline-variant pt-4">
            <div className="flex items-end justify-between gap-3">
              <dt className="font-semibold text-on-surface">{t('signup.payment.totalDue')}</dt>
              <dd className="text-2xl font-bold tracking-tight tabular-nums text-primary">
                {live ? <AnimatedAmount value={order.totalDue} format={money} /> : money(order.totalDue)}
              </dd>
            </div>
            {tuition.billingMonths > 1 ? (
              <p className="mt-1 text-end text-xs text-on-surface-variant">
                {t('applications.paymentPackage.perMonthEquivalent', { amount: money(tuition.total / tuition.billingMonths) })}
              </p>
            ) : null}
            {order.totalSavings > 0 ? (
              <p className="mt-2 text-end text-xs font-medium text-success">
                {t('signup.payment.totalSavings', { amount: money(order.totalSavings) })}
              </p>
            ) : null}
            {expectedPartner ? (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-2 text-xs text-on-surface" data-testid="expected-partner-discount">
                <MaterialSymbol name="schedule" size="text-sm" className="text-warning" />
                <span>
                  {expectedPartner.amount > 0
                    ? t('discounts.signup.expectedLine', { partner: partnerName(expectedPartner.partner, isArabic), amount: money(expectedPartner.amount) })
                    : t('discounts.signup.afterConfirm', { partner: partnerName(expectedPartner.partner, isArabic) })}
                </span>
              </p>
            ) : null}
          </div>
        </dl>
      ) : (
        <p className="rounded-xl bg-surface-container px-3 py-4 text-sm text-on-surface-variant">{t('signup.payment.selectPlanForTotal')}</p>
      )}
    </div>
  );
}

/** Phones: the total stays at the bottom of the screen while the parent scrolls the choices. */
export function SignupTotalBar({ order, className }: { order: SignupOrder; className?: string }) {
  const { t } = useTranslation();
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-surface/95 px-4 py-3 shadow-lg backdrop-blur',
        className,
      )}
    >
      {order.complete ? (
        <>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-on-surface-variant">{t('signup.payment.totalDue')}</span>
            {order.totalSavings > 0 ? (
              <span className="block text-[11px] font-medium text-success">
                {t('signup.payment.totalSavings', { amount: money(order.totalSavings) })}
              </span>
            ) : null}
          </span>
          <span className="text-xl font-bold tracking-tight tabular-nums text-primary">
            <AnimatedAmount value={order.totalDue} format={money} />
          </span>
        </>
      ) : (
        <span className="flex items-center gap-2 text-sm text-on-surface-variant">
          <MaterialSymbol name="calculate" size="text-base" className="text-primary" />
          {t('signup.payment.selectPlanForTotal')}
        </span>
      )}
    </div>
  );
}
