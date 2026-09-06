import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { PaymentAttemptItem } from '@/hooks/usePaymentAttempts';
import { confirmPaymentAttempt } from '@/lib/invoiceActions';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Props {
  attempts: PaymentAttemptItem[];
  onUpdated: () => Promise<void>;
}

export function PendingPaymentAttempts({ attempts, onUpdated }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const pending = attempts.filter((a) => a.status === 'pending_confirmation');
  if (!pending.length) return null;

  const invalidatePaymentViews = () => {
    void queryClient.invalidateQueries({ queryKey: ['payment-history'] });
    void queryClient.invalidateQueries({ queryKey: ['parent-invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['financial-reports'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-financial-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['application-package-invoice'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-applications'] });
    void queryClient.invalidateQueries({ queryKey: ['application-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['parent-applications'] });
    void queryClient.invalidateQueries({ queryKey: ['parent-dashboard-children'] });
    void queryClient.invalidateQueries({ queryKey: ['parent-dashboard-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-children-list'] });
  };

  const confirmAttempt = async (attempt: PaymentAttemptItem) => {
    try {
      await confirmPaymentAttempt(attempt.id);
      toast.success(t('payment.admin.confirmed'));
      invalidatePaymentViews();
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
      invalidatePaymentViews();
      await onUpdated();
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    }
  };

  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-warning/10 text-warning">
          <span className="material-symbols-outlined text-lg" aria-hidden>receipt_long</span>
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-on-surface">{t('payment.admin.pendingTitle')}</h2>
          <p className="text-xs text-on-surface-variant">{pending.length}</p>
        </div>
      </div>
      <div className="space-y-3">
        {pending.map((attempt) => (
          <div key={attempt.id} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: attempt.amount.toFixed(2) })}</p>
                <p className="mt-1 break-words text-xs text-on-surface-variant">{attempt.parentName}</p>
              </div>
              <span className="shrink-0 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
                {t(`payment.methods.${attempt.method}`)}
              </span>
            </div>
            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">{t('payment.admin.date')}</dt>
                <dd className="text-end font-medium text-on-surface">{new Date(attempt.createdAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">{t('payment.admin.method')}</dt>
                <dd className="text-end font-medium text-on-surface">{t(`payment.methods.${attempt.method}`)}</dd>
              </div>
            </dl>
            {attempt.proofUrl ? (
              <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary underline" href={attempt.proofUrl} target="_blank" rel="noreferrer">
                <span className="material-symbols-outlined text-sm" aria-hidden>attach_file</span>
                {t('payment.admin.viewProof')}
              </a>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="h-9 rounded-md gap-1" size="sm" onClick={() => void confirmAttempt(attempt)}>
                <span className="material-symbols-outlined text-base" aria-hidden>check</span>
                {t('payment.admin.confirm')}
              </Button>
              <Button
                className={cn('h-9 rounded-md gap-1 border-error/40 text-error hover:bg-error/10')}
                size="sm"
                variant="outline"
                onClick={() => void rejectAttempt(attempt)}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>close</span>
                {t('payment.admin.reject')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
