import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PaymentAttemptItem } from '@/hooks/usePaymentAttempts';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { confirmPaymentAttempt, MANUAL_PAYMENT_METHODS, paymentError, rejectPaymentAttempt } from '@/lib/paymentApi';
import { cn } from '@/lib/utils';

interface Props {
  attempts: PaymentAttemptItem[];
  onUpdated: () => Promise<void>;
}

/**
 * Parent payments waiting for finance. Confirming records the payment (once — a repeated
 * confirm does nothing), updates the invoice and notifies the parent; rejecting tells the
 * parent why. Both run on the server and only one action runs at a time.
 */
export function PendingPaymentAttempts({ attempts, onUpdated }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const flight = useSingleFlight();
  const [rejecting, setRejecting] = useState<PaymentAttemptItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const pending = attempts.filter((a) => a.status === 'pending_confirmation');
  if (!pending.length) return null;

  const methodLabel = (method: string) =>
    (MANUAL_PAYMENT_METHODS as readonly string[]).includes(method) || method === 'manual'
      ? t(`payment.manualMethods.${method}.label`)
      : t(`payment.methods.${method}`, { defaultValue: method });

  const invalidatePaymentViews = () => {
    void queryClient.invalidateQueries({ queryKey: ['payment-history'] });
    void queryClient.invalidateQueries({ queryKey: ['parent-invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['invoice-details'] });
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

  const confirmAttempt = (attempt: PaymentAttemptItem) =>
    flight.run(async () => {
      const ok = await confirm({
        title: t('payment.admin.confirmTitle'),
        description: [
          t('payment.admin.confirmDescription', {
            amount: t('invoice.egpAmount', { amount: attempt.amount.toFixed(2) }),
            parent: attempt.parentName,
            method: methodLabel(attempt.method),
          }),
          attempt.reference ? t('payment.confirm.reference', { reference: attempt.reference }) : '',
        ]
          .filter(Boolean)
          .join(' '),
        confirmText: t('payment.admin.confirm'),
        icon: 'price_check',
      });
      if (!ok) return;
      try {
        await confirmPaymentAttempt(attempt.id);
        toast.success(t('payment.admin.confirmed'));
        invalidatePaymentViews();
        await onUpdated();
      } catch (error) {
        const { key, values } = paymentError(error);
        toast.error(t(key, values));
      }
    });

  const submitReject = () =>
    flight.run(async () => {
      if (!rejecting) return;
      try {
        await rejectPaymentAttempt(rejecting.id, rejectReason);
        toast.success(t('payment.admin.rejected'));
        setRejecting(null);
        setRejectReason('');
        invalidatePaymentViews();
        await onUpdated();
      } catch (error) {
        const { key, values } = paymentError(error);
        toast.error(t(key, values));
      }
    });

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
                {methodLabel(attempt.method)}
              </span>
            </div>
            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">{t('payment.admin.date')}</dt>
                <dd className="text-end font-medium text-on-surface">{new Date(attempt.createdAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">{t('payment.admin.method')}</dt>
                <dd className="text-end font-medium text-on-surface">{methodLabel(attempt.method)}</dd>
              </div>
              {attempt.reference ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant">{t('payment.reference')}</dt>
                  <dd className="break-all text-end font-mono font-medium text-on-surface">{attempt.reference}</dd>
                </div>
              ) : null}
            </dl>
            {attempt.proofUrl ? (
              <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary underline" href={attempt.proofUrl} target="_blank" rel="noreferrer">
                <span className="material-symbols-outlined text-sm" aria-hidden>attach_file</span>
                {t('payment.admin.viewProof')}
              </a>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                className="h-9 rounded-md gap-1"
                size="sm"
                disabled={flight.running}
                onClick={() => void confirmAttempt(attempt)}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>check</span>
                {t('payment.admin.confirm')}
              </Button>
              <Button
                className={cn('h-9 rounded-md gap-1 border-error/40 text-error hover:bg-error/10')}
                size="sm"
                variant="outline"
                disabled={flight.running}
                onClick={() => {
                  setRejectReason('');
                  setRejecting(attempt);
                }}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>close</span>
                {t('payment.admin.reject')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => (!open && !flight.running ? setRejecting(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payment.admin.rejectTitle')}</DialogTitle>
            <DialogDescription>
              {rejecting
                ? t('payment.admin.rejectDescription', {
                    amount: t('invoice.egpAmount', { amount: rejecting.amount.toFixed(2) }),
                    parent: rejecting.parentName,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t('payment.admin.rejectReason')}</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              maxLength={300}
              placeholder={t('payment.admin.rejectReasonPlaceholder')}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <p className="text-xs text-on-surface-variant">{t('payment.admin.rejectReasonHelp')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={flight.running} onClick={() => setRejecting(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" disabled={flight.running} aria-busy={flight.running} onClick={() => void submitReject()}>
              {flight.running ? t('payment.submitting') : t('payment.admin.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
