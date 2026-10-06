import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { newIdempotencyKey, paymentError } from '@/lib/paymentApi';

type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'paymob'
  | 'fawry'
  | 'instapay'
  | 'vodafone_cash'
  | 'orange_cash';

interface Props {
  disabled: boolean;
  /** The amount being recorded, shown in the confirmation. */
  amountLabel?: string;
  onView: () => void;
  onMarkPaid: (payload: { paymentMethod: PaymentMethod; paidAt: string; notes: string; idempotencyKey: string }) => Promise<void>;
  onCancel: () => Promise<void>;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'paymob',
  'fawry',
  'instapay',
  'vodafone_cash',
  'orange_cash',
];

export function InvoiceActionsMenu({ disabled, amountLabel, onView, onMarkPaid, onCancel }: Props) {
  const { t } = useTranslation();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  // One key per opening of the dialog: a double click or a retry records the payment once.
  const [paymentKey, setPaymentKey] = useState(newIdempotencyKey);
  const flight = useSingleFlight();
  const isSubmitting = flight.running;

  const openMarkPaid = () => {
    setPaymentKey(newIdempotencyKey());
    setMarkPaidOpen(true);
  };

  const submitMarkPaid = () =>
    flight.run(async () => {
      try {
        await onMarkPaid({ paymentMethod, paidAt, notes, idempotencyKey: paymentKey });
        setMarkPaidOpen(false);
        setNotes('');
      } catch (error) {
        const { key, values } = paymentError(error);
        toast.error(t(key, values));
      }
    });

  const submitCancel = () =>
    flight.run(async () => {
      try {
        await onCancel();
        setCancelOpen(false);
      } catch {
        toast.error(t('payment.errors.actionFailed'));
      }
    });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onView}>
          {t('invoice.actions.viewDetails')}
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={openMarkPaid}>
          {t('invoice.actions.markPaid')}
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setCancelOpen(true)}>
          {t('invoice.actions.cancel')}
        </Button>
      </div>

      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoice.markPaid.title')}</DialogTitle>
            <DialogDescription>
              {amountLabel ? t('invoice.markPaid.descriptionAmount', { amount: amountLabel }) : t('invoice.markPaid.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('invoice.markPaid.paymentMethod')}</Label>
              <select
                className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`invoice.paymentMethods.${method}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('invoice.markPaid.paymentDate')}</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('invoice.markPaid.notes')}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => void submitMarkPaid()} disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? t('payment.submitting') : t('invoice.markPaid.confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoice.cancel.title')}</DialogTitle>
            <DialogDescription>{t('invoice.cancel.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t('invoice.cancel.keep')}
            </Button>
            <Button onClick={() => void submitCancel()} disabled={isSubmitting}>
              {t('invoice.cancel.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
