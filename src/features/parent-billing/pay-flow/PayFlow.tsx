import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useInvoiceCheckout } from '@/hooks/useInvoiceCheckout';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { invalidatePaymentQueries } from '@/hooks/useSubmitInvoicePayment';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { newIdempotencyKey, paymentError, redeemLoyaltyPoints } from '@/lib/paymentApi';
import { paymentFlowOf } from '@/lib/paymentMethods';

import { amountPolicyOf, payFlowSteps, pointsDiscount, pointsLimits } from '../parentBilling';
import type { BillingInvoiceDetails } from '../parentBillingApi';
import { AmountStep, type AmountChoice } from './AmountStep';
import { ConfirmStep } from './ConfirmStep';
import { MethodStep } from './MethodStep';
import { PayFlowProgress } from './PayFlowProgress';
import { PayOutcome } from './PayOutcome';
import { PointsStep } from './PointsStep';

type Sent = 'sent' | 'already_sent';

/**
 * Paying one invoice, a step at a time: the amount (everything by default), points (when the
 * parent has enough), the method, then a last look before sending. It ends on what happens next,
 * and shows why there is nothing to pay when the invoice is paid, cancelled or already sent.
 *
 * Sent once: the checkout hook drops a second click and reuses one idempotency key per payment;
 * points use their own key per amount, so a retried redemption is answered, not applied twice.
 */
export function PayFlow({
  invoice,
  returnPath,
  onChanged,
}: {
  invoice: BillingInvoiceDetails;
  /** Where card checkout brings the parent back to. */
  returnPath: string;
  /** Reads the invoice again (after points change its amount, or a payment fails). */
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });

  // The steps are fixed for the visit, so using up the points does not move the parent along.
  const [steps] = useState(() => payFlowSteps(pointsLimits(invoice.loyalty).usable));
  const [stepIndex, setStepIndex] = useState(0);
  const [choice, setChoice] = useState<AmountChoice>({ mode: 'all' });
  const [sent, setSent] = useState<Sent | null>(null);
  const [discount, setDiscount] = useState(0);
  const redeemFlight = useSingleFlight();
  const redeemKey = useRef<{ points: number; key: string } | null>(null);

  const checkout = useInvoiceCheckout({
    invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, payableAmount: invoice.payable },
    amountPolicy: amountPolicyOf(invoice),
    returnPath,
    confirmBeforePay: false,
    onSubmitted: ({ duplicate }) => setSent(duplicate ? 'already_sent' : 'sent'),
  });

  const chooseAmount = (next: AmountChoice) => {
    setChoice(next);
    checkout.setAmountText(next.mode === 'all' ? null : next.text);
  };

  const redeem = (points: number) =>
    redeemFlight.run(async () => {
      const amount = money(pointsDiscount(points, invoice.loyalty.rate));
      const ok = await confirm({
        title: t('loyalty.confirmRedeem.title'),
        description: t('loyalty.confirmRedeem.description', { points, amount, number: invoice.invoiceNumber }),
        confirmText: t('loyalty.confirmRedeem.confirm'),
        icon: 'redeem',
      });
      if (!ok) return;
      if (redeemKey.current?.points !== points) redeemKey.current = { points, key: newIdempotencyKey() };
      try {
        const result = await redeemLoyaltyPoints({ invoiceId: invoice.id, points, idempotencyKey: redeemKey.current.key });
        redeemKey.current = null;
        if (result.status === 'redeemed') setDiscount((d) => d + (result.discount ?? pointsDiscount(points, invoice.loyalty.rate)));
        // The amount left changed: pay all of the new amount unless the parent chooses again.
        chooseAmount({ mode: 'all' });
        toast.success(t(result.status === 'duplicate' ? 'loyalty.redemptionAlreadyApplied' : 'loyalty.redemptionApplied'));
      } catch (error) {
        const { key, values } = paymentError(error);
        if (key !== 'payment.errors.actionFailed') redeemKey.current = null;
        toast.error(t(key, values));
      }
      invalidatePaymentQueries(queryClient, user?.id);
      void queryClient.invalidateQueries({ queryKey: ['loyalty-transactions'] });
      await onChanged();
    });

  // Nothing (more) to pay here.
  if (sent) return <PayOutcome kind={sent} invoiceId={invoice.id} />;
  if (invoice.status === 'cancelled') return <PayOutcome kind="cancelled" invoiceId={invoice.id} />;
  if (invoice.status === 'paid') return <PayOutcome kind={discount > 0 ? 'paid_with_points' : 'paid'} invoiceId={invoice.id} />;
  if (invoice.payable <= 0) {
    return (
      <PayOutcome
        kind="waiting"
        invoiceId={invoice.id}
        extra={
          <ul className="space-y-1 text-sm text-on-surface">
            {invoice.inReview.map((p) => (
              <li key={p.id}>{t('parentBilling.pay.alreadySentLine', { amount: money(p.amount), date: formatDateTime(p.at) })}</li>
            ))}
          </ul>
        }
      />
    );
  }

  const step = steps[stepIndex];
  const last = stepIndex === steps.length - 1;
  const canContinue =
    step === 'amount' ? checkout.amountValid : step === 'method' ? checkout.method !== null && checkout.issues.length === 0 : true;
  const redirects = checkout.method !== null && paymentFlowOf(checkout.method) === 'online_checkout' && !checkout.testMode;

  return (
    <div className="space-y-5">
      <PayFlowProgress steps={steps} current={stepIndex} onGoTo={setStepIndex} />
      <section aria-labelledby="pay-step-title" className="space-y-4">
        <h2 id="pay-step-title" className="text-base font-semibold text-on-surface">
          {t(`parentBilling.pay.titles.${step}`)}
        </h2>
        {step === 'amount' ? (
          <AmountStep payable={invoice.payable} policy={amountPolicyOf(invoice)} inReview={invoice.inReview} choice={choice} onChange={chooseAmount} />
        ) : step === 'points' ? (
          <PointsStep
            balance={invoice.loyalty.balance}
            limits={pointsLimits(invoice.loyalty)}
            appliedDiscount={discount}
            applying={redeemFlight.running}
            onApply={(points) => void redeem(points)}
          />
        ) : step === 'method' ? (
          <MethodStep checkout={checkout} />
        ) : (
          <ConfirmStep checkout={checkout} invoiceNumber={invoice.invoiceNumber} discount={discount} />
        )}
      </section>

      <div className="flex flex-col-reverse gap-2 border-t border-outline-variant pt-4 sm:flex-row sm:justify-between">
        {stepIndex > 0 ? (
          <Button type="button" variant="ghost" data-testid="pay-back" onClick={() => setStepIndex((i) => i - 1)} disabled={checkout.submitting}>
            <MaterialSymbol name="arrow_back" size="text-lg" className="me-1 rtl:rotate-180" />
            {t('parentBilling.pay.back')}
          </Button>
        ) : (
          <span />
        )}
        {last ? (
          <Button
            type="button"
            size="lg"
            className="gap-2"
            disabled={!checkout.canPay}
            aria-busy={checkout.submitting}
            onClick={() => void checkout.pay()}
          >
            <MaterialSymbol name={checkout.submitting ? 'hourglass_top' : 'lock'} size="text-lg" />
            {checkout.submitting
              ? t('payment.submitting')
              : redirects
                ? t('payment.checkout.continueToCheckout', { amount: money(checkout.amount) })
                : t('parentBilling.pay.send', { amount: money(checkout.amountValid ? checkout.amount : 0) })}
          </Button>
        ) : (
          <Button type="button" size="lg" disabled={!canContinue} onClick={() => setStepIndex((i) => i + 1)}>
            {step === 'points' && discount === 0 ? t('parentBilling.pay.skipPoints') : t('parentBilling.pay.next')}
            <MaterialSymbol name="arrow_forward" size="text-lg" className="ms-1 rtl:rotate-180" />
          </Button>
        )}
      </div>
    </div>
  );
}
