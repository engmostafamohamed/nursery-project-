import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PointsRedemptionWidget } from '@/components/parent/PointsRedemptionWidget';
import { Button } from '@/components/ui/button';
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
  const [submitting, setSubmitting] = useState(false);
  const submitPayment = useSubmitInvoicePayment();

  const inReview = Boolean(invoice?.inReview);

  const handlePayNow = async () => {
    if (!invoice) return;
    setSubmitting(true);
    try {
      await submitPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: invoice.amount,
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
    <div className="mx-auto w-full max-w-md space-y-4 pb-28">
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <p className="text-xs text-on-surface-variant">{t('invoice.invoiceNumber', { number: invoice?.invoiceNumber ?? '' })}</p>
        <p className="mt-1 text-2xl font-extrabold text-on-surface">{t('invoice.egpAmount', { amount: invoice?.amount.toFixed(2) ?? '0.00' })}</p>
        <p className="text-xs text-on-surface-variant">{t('invoice.dueDate', { date: invoice ? formatDate(invoice.dueDate) : '-' })}</p>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-outline-variant bg-surface-container p-3 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-base text-primary" aria-hidden>
          verified_user
        </span>
        <p>{t('payment.approvalNote')}</p>
      </div>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <button type="button" className="w-full text-start text-sm font-semibold" onClick={() => setExpanded((v) => !v)}>
          {t('payment.summary.title')}
        </button>
        {expanded ? (
          <div className="mt-2 space-y-1 text-sm">
            {(invoice?.lineItems ?? []).map((item, idx) => (
              <div key={`${idx}-${item.description}`} className="flex justify-between">
                <span>{item.description}</span>
                <span>{t('invoice.egpAmount', { amount: item.total.toFixed(2) })}</span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-sm font-semibold">{t('invoice.details.total')}: {t('invoice.egpAmount', { amount: invoice?.amount.toFixed(2) ?? '0.00' })}</p>
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

      {inReview ? (
        <div className="rounded-2xl border border-outline-variant bg-primary/5 p-4 text-sm text-primary">
          {t('invoice.inReviewNote')}
        </div>
      ) : (
        <Button className="w-full" onClick={() => void handlePayNow()} disabled={submitting || !invoice}>
          {submitting ? t('payment.submitting') : t('payment.payNowAmount', { amount: invoice?.amount.toFixed(2) ?? '0.00' })}
        </Button>
      )}

      <Button variant="outline" className="w-full" onClick={() => navigate(`/parent/invoices/${invoiceId}${qs}`)}>
        {t('invoice.details.back')}
      </Button>
    </div>
  );
}
