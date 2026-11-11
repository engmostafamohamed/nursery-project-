import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/textarea';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { useMoney } from './kitchenLook';
import type { KitchenCharge } from './kitchenSales';
import { cancelKitchenCharge, kitchenErrorKey } from './kitchenSalesApi';
import { useKitchenSale } from './useKitchenSales';

/** Cancelling a charge made by mistake: the reason is kept, the stock comes back and the bill drops it. */
export function CancelChargeDialog({ charge, onClose }: { charge: KitchenCharge; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useKitchenSale(() => cancelKitchenCharge(charge.id, reason));
  const issue = reason.trim().length < 3 ? 'reason_required' : reason.trim().length > 200 ? 'reason_too_long' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || run.isPending) return;
    setProblem(null);
    try {
      await run.mutateAsync(undefined);
      toast.success(t('kitchenSales.sales.cancelled'));
      onClose();
    } catch (error) {
      setProblem(t(kitchenErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="cancel-charge-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('kitchenSales.sales.cancelTitle')}</DialogTitle>
            <DialogDescription>
              {t('kitchenSales.sales.cancelBody', {
                item: charge.itemName,
                quantity: charge.quantity,
                unit: charge.unit,
                name: (localName(charge.nameAr, charge.nameEn, isArabic)) || '—',
                amount: money(charge.net),
              })}
            </DialogDescription>
          </DialogHeader>
          <FormField id="cancel-reason" label={t('kitchenSales.sales.reason')} error={tried && issue ? t(`kitchenSales.issues.${issue}`) : null}>
            <Textarea id="cancel-reason" className={cn('min-h-20 text-sm', tried && issue && invalidFieldClass)} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={t('kitchenSales.sales.reasonPlaceholder')} />
          </FormField>
          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" variant="destructive" disabled={run.isPending}>{run.isPending ? t('common.saving') : t('kitchenSales.sales.cancelConfirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
