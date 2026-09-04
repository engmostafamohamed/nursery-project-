import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PointsRedemptionWidget } from '@/components/parent/PointsRedemptionWidget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useInvoiceDetails } from '@/hooks/useInvoiceDetails';
import { useLoyalty } from '@/hooks/useLoyalty';
import { formatDate } from '@/lib/datetime';
import { useSubmitInvoicePayment } from '@/hooks/useSubmitInvoicePayment';
import { useSettings } from '@/lib/useSettings';
import { redeemLoyaltyPoints } from '@/lib/loyaltyPoints';
import { supabase } from '@/lib/supabase';

export function ParentPaymentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const { settings, nurseryId } = useSettings();
  const loyalty = useLoyalty({ parentId: user?.id, nurseryId: nurseryId ?? undefined, enabled: Boolean(settings.loyalty_enabled) });
  const invoiceQuery = useInvoiceDetails(invoiceId);
  const invoice = invoiceQuery.data;
  const [expanded, setExpanded] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitPayment = useSubmitInvoicePayment();

  const inReview = Boolean(invoice?.inReview);
  const balanceDue = invoice?.balanceDue ?? invoice?.amount ?? 0;
  const parsedPaymentAmount = useMemo(() => Number(paymentAmount), [paymentAmount]);
  const defaultPaymentAmount = useMemo(
    () => (invoice ? (invoice.balanceDue || invoice.amount).toFixed(2) : ''),
    [invoice],
  );
  const validPaymentAmount =
    Number.isFinite(parsedPaymentAmount) && parsedPaymentAmount > 0 && parsedPaymentAmount <= balanceDue;

  useEffect(() => {
    if (!defaultPaymentAmount) return;
    setPaymentAmount(defaultPaymentAmount);
  }, [defaultPaymentAmount]);

  const handlePayNow = async () => {
    if (!invoice || !validPaymentAmount) return;
    setSubmitting(true);
    try {
      await submitPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: parsedPaymentAmount,
        invoiceNumber: invoice.invoiceNumber,
      });
      await invoiceQuery.refetch();
      toast.success(t('payment.submittedForApproval'));
      navigate(`/parent/invoices${qs}`);
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-28">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">{t('payment.amountToPay', { defaultValue: 'Amount to pay' })}</p>
            <h1 className="mt-1 text-3xl font-semibold text-on-surface">
              {t('invoice.egpAmount', { amount: balanceDue.toFixed(2) })}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {t('invoice.invoiceNumber', { number: invoice?.invoiceNumber ?? '' })}
            </p>
          </div>
          <Button variant="outline" className="h-10 rounded-md" onClick={() => navigate(`/parent/invoices/${invoiceId}${qs}`)}>
            {t('invoice.details.back')}
          </Button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-xs text-on-surface-variant">{t('invoice.details.total')}</p>
                <p className="mt-1 text-base font-semibold text-on-surface">{t('invoice.egpAmount', { amount: invoice?.amount.toFixed(2) ?? '0.00' })}</p>
              </div>
              <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-xs text-on-surface-variant">{t('financial.paymentHistory.paid', { defaultValue: 'Paid' })}</p>
                <p className="mt-1 text-base font-semibold text-success">{t('invoice.egpAmount', { amount: (invoice?.paidAmount ?? 0).toFixed(2) })}</p>
              </div>
              <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-xs text-on-surface-variant">{t('invoice.inReview')}</p>
                <p className="mt-1 text-base font-semibold text-warning">{t('invoice.egpAmount', { amount: (invoice?.pendingAmount ?? 0).toFixed(2) })}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-outline-variant bg-primary/5 p-3 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-base text-primary" aria-hidden>
                verified_user
              </span>
              <p>{t('payment.approvalNote')}</p>
            </div>

            <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
              <button type="button" className="flex w-full items-center justify-between gap-3 text-start text-sm font-semibold" onClick={() => setExpanded((v) => !v)}>
                <span>{t('payment.summary.title')}</span>
                <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden>
                  {expanded ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {expanded ? (
                <div className="mt-3 space-y-2 text-sm">
                  {(invoice?.lineItems ?? []).map((item, idx) => (
                    <div key={`${idx}-${item.description}`} className="flex justify-between gap-3 border-t border-outline-variant pt-2">
                      <span className="min-w-0 text-on-surface-variant">{item.description}</span>
                      <span className="shrink-0 font-medium text-on-surface">{t('invoice.egpAmount', { amount: item.total.toFixed(2) })}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-sm font-semibold">{t('invoice.details.total')}: {t('invoice.egpAmount', { amount: invoice?.amount.toFixed(2) ?? '0.00' })}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{t('invoice.dueDate', { date: invoice ? formatDate(invoice.dueDate) : '-' })}</p>
            </section>

            <PointsRedemptionWidget
              enabled={Boolean(settings.loyalty_enabled) && !inReview}
              balance={loyalty.summary.balance}
              invoiceAmount={invoice?.amount ?? 0}
              rate={Number(settings.points_redemption_rate ?? 0)}
              minPoints={100}
              maxDiscountPercent={0.5}
              onRedeem={async (points, discountEgp) => {
                if (!invoice || !nurseryId || !user?.id) return;
                await redeemLoyaltyPoints({
                  nurseryId,
                  parentId: user.id,
                  invoiceId: invoice.id,
                  points,
                  description: `Redeemed for discount EGP ${discountEgp.toFixed(2)}`,
                });
                await supabase
                  .from('invoices')
                  .update({ amount: Math.max(0, invoice.amount - discountEgp).toFixed(2) } as never)
                  .eq('id', invoice.id);
                await invoiceQuery.refetch();
                toast.success(t('loyalty.redemptionApplied'));
              }}
            />
          </div>

          <aside className="border-t border-outline-variant bg-surface-container-lowest p-4 sm:p-5 lg:border-l lg:border-t-0">
            {inReview ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                {t('invoice.inReviewNote')}
              </div>
            ) : (
              <section className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('payment.amountToPay', { defaultValue: 'Amount to pay' })}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={balanceDue || undefined}
                    step={0.01}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPaymentAmount(balanceDue.toFixed(2))}>
                    {t('payment.fullBalance', { defaultValue: 'Full balance' })}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentAmount(Math.max(1, balanceDue / 2).toFixed(2))}
                  >
                    {t('payment.halfBalance', { defaultValue: 'Half' })}
                  </Button>
                </div>
                {!validPaymentAmount && paymentAmount ? (
                  <p className="text-xs text-error">
                    {t('payment.invalidPartialAmount', { defaultValue: 'Enter an amount greater than 0 and not more than the balance.' })}
                  </p>
                ) : null}
                <Button className="h-11 w-full rounded-md" onClick={() => void handlePayNow()} disabled={submitting || !invoice || !validPaymentAmount}>
                  {submitting ? t('payment.submitting') : t('payment.payNowAmount', { amount: validPaymentAmount ? parsedPaymentAmount.toFixed(2) : '0.00' })}
                </Button>
              </section>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
