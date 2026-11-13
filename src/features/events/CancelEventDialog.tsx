import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { CANCEL_REASON_MAX, cancelEvent, eventFlowErrorKey, type CancelResult } from './eventFlowApi';

/**
 * Cancelling an event, always with a reason. The server tells the families of the children asked,
 * cancels the invoices not paid yet, and tells the admins how many families already paid (with the
 * nursery's refund policy). `forFamily`: a family taking back its own urgent event, read by the
 * nursery and the teachers.
 */
export function CancelEventDialog({ eventId, eventTitle, onClose, onCancelled, forFamily = false }: {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
  onCancelled: (result: CancelResult) => void;
  forFamily?: boolean;
}) {
  const { t } = useTranslation();
  const copy = forFamily ? 'eventFlow.familyCancel' : 'eventFlow.cancel';
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const cancel = useMutation({ mutationFn: () => cancelEvent(eventId, reason) });
  const trimmed = reason.trim();
  const issue = !trimmed ? t('eventFlow.cancel.reasonRequired') : trimmed.length > CANCEL_REASON_MAX ? t('eventFlow.cancel.reasonTooLong', { max: CANCEL_REASON_MAX }) : null;

  const submit = async () => {
    setTried(true);
    if (issue || cancel.isPending) return;
    setProblem(null);
    try {
      const result = await cancel.mutateAsync();
      const notes = forFamily
        ? t('eventFlow.familyCancel.doneHint')
        : [
            t('eventFlow.cancel.doneFamilies', { count: result.notified }),
            result.invoicesCancelled ? t('eventFlow.cancel.doneInvoices', { count: result.invoicesCancelled }) : null,
            result.paidInvoices ? t('eventFlow.cancel.donePaid', { count: result.paidInvoices }) : null,
          ].filter(Boolean).join(' ');
      toast.success(t(`${copy}.done`), { description: notes });
      onCancelled(result);
    } catch (error) {
      setProblem(t(eventFlowErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !cancel.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="cancel-event-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MaterialSymbol name="event_busy" size="text-xl" className="text-error" />
            {t(`${copy}.title`, { event: eventTitle })}
          </DialogTitle>
          <DialogDescription>{t(`${copy}.body`)}</DialogDescription>
        </DialogHeader>
        <FormField id="cancel-event-reason" label={t(`${copy}.reason`)} hint={t(`${copy}.reasonHint`)} error={tried ? issue : null}>
          <Textarea
            id="cancel-event-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t(`${copy}.reasonPlaceholder`)}
            aria-invalid={Boolean(tried && issue)}
            className={cn('min-h-24', tried && issue && invalidFieldClass)}
            autoFocus
          />
        </FormField>
        <p className={cn('-mt-2 text-end text-xs', trimmed.length > CANCEL_REASON_MAX ? 'text-error' : 'text-on-surface-variant')}>
          {trimmed.length}/{CANCEL_REASON_MAX}
        </p>
        <FormProblem message={problem} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={cancel.isPending}>{t('eventFlow.cancel.keep')}</Button>
          <Button type="button" variant="destructive" onClick={() => void submit()} disabled={cancel.isPending} data-testid="cancel-event-confirm">
            {cancel.isPending ? t('common.saving') : t('eventFlow.cancel.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
