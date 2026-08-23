import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { PaymentAttemptItem } from '@/hooks/usePaymentAttempts';
import { markInvoiceAsPaid } from '@/lib/invoiceActions';
import { supabase } from '@/lib/supabase';

interface Props {
  attempts: PaymentAttemptItem[];
  invoice: {
    id: string;
    nurseryId: string;
    parentId: string;
    invoiceNumber: string;
    amount: number;
  };
  onUpdated: () => Promise<void>;
}

export function PendingPaymentAttempts({ attempts, invoice, onUpdated }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const pending = attempts.filter((a) => a.status === 'pending_confirmation');
  if (!pending.length) return null;

  const confirmAttempt = async (attempt: PaymentAttemptItem) => {
    try {
      await markInvoiceAsPaid({
        invoiceId: invoice.id,
        nurseryId: invoice.nurseryId,
        parentId: invoice.parentId,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        paymentMethod: attempt.method,
        paidAt: new Date().toISOString().slice(0, 10),
      });
      await supabase
        .from('payment_attempts')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id ?? null,
        } as never)
        .eq('id', attempt.id);
      toast.success(t('payment.admin.confirmed'));
      await onUpdated();
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    }
  };

  const rejectAttempt = async (attempt: PaymentAttemptItem) => {
    try {
      await supabase
        .from('payment_attempts')
        .update({ status: 'cancelled', confirmed_at: new Date().toISOString(), confirmed_by: user?.id ?? null } as never)
        .eq('id', attempt.id);
      await supabase.from('notifications').insert({
        nursery_id: attempt.nurseryId,
        user_id: attempt.parentId,
        type: 'payment_attempt_rejected',
        title_ar: 'تم رفض محاولة الدفع',
        title_en: 'Payment attempt rejected',
        body_ar: 'يرجى المحاولة مرة أخرى أو اختيار طريقة دفع أخرى.',
        body_en: 'Please try again or use another payment method.',
        channel: 'push',
        read: false,
        sent_at: new Date().toISOString(),
      } as never);
      toast.success(t('payment.admin.rejected'));
      await onUpdated();
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    }
  };

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="mb-2 text-sm font-semibold">{t('payment.admin.pendingTitle')}</h2>
      <div className="space-y-2">
        {pending.map((attempt) => (
          <div key={attempt.id} className="rounded-lg border border-outline-variant p-3 text-sm">
            <p>{t('payment.admin.method')}: {t(`payment.methods.${attempt.method}`)}</p>
            <p>{t('payment.admin.amount')}: {t('invoice.egpAmount', { amount: attempt.amount.toFixed(2) })}</p>
            <p>{t('payment.admin.date')}: {new Date(attempt.createdAt).toLocaleString()}</p>
            <p>{t('payment.admin.parent')}: {attempt.parentName}</p>
            {attempt.proofUrl ? (
              <a className="text-secondary underline" href={attempt.proofUrl} target="_blank" rel="noreferrer">
                {t('payment.admin.viewProof')}
              </a>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void confirmAttempt(attempt)}>{t('payment.admin.confirm')}</Button>
              <Button size="sm" variant="outline" onClick={() => void rejectAttempt(attempt)}>{t('payment.admin.reject')}</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
