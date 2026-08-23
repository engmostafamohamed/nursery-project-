import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
  onView: () => void;
  onMarkPaid: (payload: { paymentMethod: PaymentMethod; paidAt: string; notes: string }) => Promise<void>;
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

export function InvoiceActionsMenu({ disabled, onView, onMarkPaid, onCancel }: Props) {
  const { t } = useTranslation();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const submitMarkPaid = async () => {
    setIsSubmitting(true);
    try {
      await onMarkPaid({ paymentMethod, paidAt, notes });
      setMarkPaidOpen(false);
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCancel = async () => {
    setIsSubmitting(true);
    try {
      await onCancel();
      setCancelOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onView}>
          {t('invoice.actions.viewDetails')}
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setMarkPaidOpen(true)}>
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
            <DialogDescription>{t('invoice.markPaid.description')}</DialogDescription>
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
              <Button onClick={() => void submitMarkPaid()} disabled={isSubmitting}>
                {t('invoice.markPaid.confirm')}
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
