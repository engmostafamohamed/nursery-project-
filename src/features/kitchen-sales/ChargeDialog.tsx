import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { KitchenItem } from '@/features/food-and-beverage/kitchen';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { ChildSearch } from './ChildSearch';
import { newTakingKey, useMoney } from './kitchenLook';
import { bestDiscount, chargePreview, quantityIssue, type KitchenDiscount, type StaffPerson } from './kitchenSales';
import { chargeChildStockItem, chargeStaffItem, errorDetail, giveChildExtra, kitchenErrorKey, type KitchenChild } from './kitchenSalesApi';
import { useKitchenSale } from './useKitchenSales';

type Consumer = 'staff' | 'child';

/**
 * Taking an item for someone: a member of staff (charged to their account, deducted from their next
 * payslip) or a child: from the kitchen, an extra (served now if the parents agreed at enrollment,
 * otherwise sent to them to approve); from the store, charged at once to the family's extras invoice
 * (the parents are told). Shows the price, the discount that applies and what is charged before saving.
 */
export function ChargeDialog({
  nurseryId,
  item,
  staff,
  discounts,
  today,
  onClose,
}: {
  nurseryId: string;
  item: KitchenItem;
  staff: StaffPerson[];
  discounts: KitchenDiscount[];
  today: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const store = item.section === 'store';
  const forChildren = item.childPrice !== null && (store || item.extraKind !== null);
  const childMax = store ? 100 : 10;
  const forStaff = (item.staffPrice ?? item.childPrice) !== null;
  // The store's priced items (diapers, uniforms) are mostly for children; the kitchen's for staff.
  const [consumer, setConsumer] = useState<Consumer>((store && forChildren) || !forStaff ? 'child' : 'staff');
  const [staffId, setStaffId] = useState('');
  const [child, setChild] = useState<KitchenChild | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const key = useRef(newTakingKey());

  const personId = consumer === 'staff' ? staffId : child?.id ?? '';
  const qIssue = quantityIssue(quantity, item.quantity, consumer === 'child' ? childMax : 1000);
  const personIssue = !personId ? 'person_required' : null;
  const price = consumer === 'staff' ? item.staffPrice ?? item.childPrice ?? 0 : item.childPrice ?? 0;
  const discount = personId ? bestDiscount(discounts, { itemId: item.id, consumer, personId }, today) : null;
  const preview = chargePreview(price, qIssue ? 0 : Number(quantity), discount?.percent ?? 0);

  const run = useKitchenSale(async (): Promise<{ staff: boolean; served: boolean }> => {
    if (consumer === 'staff') {
      await chargeStaffItem({ itemId: item.id, quantity: Number(quantity), staffUserId: staffId, note, key: key.current });
      return { staff: true, served: true };
    }
    if (store) {
      await chargeChildStockItem({ childId: personId, itemId: item.id, quantity: Number(quantity), note, key: key.current });
      return { staff: false, served: true };
    }
    const result = await giveChildExtra({ childId: personId, itemId: item.id, quantity: Number(quantity), note, key: key.current });
    return { staff: false, served: result.status === 'served' };
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (qIssue || personIssue || run.isPending) return;
    setProblem(null);
    try {
      const result = await run.mutateAsync(undefined);
      toast.success(t(result.staff ? 'kitchenSales.charge.staffDone' : store ? 'kitchenSales.charge.storeChildDone' : result.served ? 'kitchenSales.charge.childServed' : 'kitchenSales.charge.childAsked'));
      onClose();
    } catch (error) {
      const k = kitchenErrorKey(error);
      const detail = errorDetail(error);
      setProblem(t(k, {
        quantity: detail,
        unit: item.unit,
        foods: detail.split(',').filter(Boolean).map((f) => t(`fnb.allergens.${f}`, { defaultValue: f })).join('، '),
      }));
      key.current = newTakingKey();
    }
  };

  const staffName = (s: StaffPerson) => (localName(s.nameAr, s.nameEn, isArabic)) || '—';

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto" data-testid="charge-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t('kitchenSales.charge.title', { item: item.name })}</DialogTitle>
            <DialogDescription>{t('fnb.kitchen.inStock', { quantity: item.quantity, unit: item.unit })}</DialogDescription>
          </DialogHeader>

          <ChoiceCards
            label={t('kitchenSales.charge.for')}
            value={consumer}
            onChange={(c) => { setConsumer(c); setProblem(null); }}
            options={(['staff', 'child'] as const).map((c) => {
              const allowed = c === 'staff' ? forStaff : forChildren;
              return {
                value: c,
                label: t(`kitchenSales.charge.${c}`),
                icon: c === 'staff' ? 'badge' : 'child_care',
                disabled: !allowed,
                hint: allowed ? money(c === 'staff' ? item.staffPrice ?? item.childPrice ?? 0 : item.childPrice ?? 0) : t(c === 'child' && store ? 'kitchenSales.charge.storeChildNotSold' : `kitchenSales.charge.${c}NotSold`),
              };
            })}
          />

          {consumer === 'staff' ? (
            <FormField id="charge-staff" label={t('kitchenSales.charge.whichStaff')} error={tried && personIssue ? t('kitchenSales.issues.person_required') : null}>
              <Select id="charge-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)} className={cn(tried && personIssue && invalidFieldClass)}>
                <option value="">{t('kitchenSales.charge.chooseStaff')}</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{staffName(s)}</option>)}
              </Select>
            </FormField>
          ) : (
            <FormField id="charge-child" label={t('kitchenSales.charge.whichChild')} error={tried && personIssue ? t('kitchenSales.issues.person_required') : null} hint={t(store ? 'kitchenSales.charge.storeChildHint' : 'kitchenSales.charge.childHint')}>
              <ChildSearch id="charge-child" nurseryId={nurseryId} value={child} onChange={setChild} invalid={tried && Boolean(personIssue)} />
            </FormField>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id="charge-quantity"
              label={t('kitchenSales.charge.quantity', { unit: item.unit })}
              error={(tried || quantity !== '1') && qIssue ? t(`kitchenSales.quantityIssues.${qIssue}`, { quantity: item.quantity, unit: item.unit, max: consumer === 'child' ? childMax : 1000 }) : null}
            >
              <Input id="charge-quantity" inputMode="decimal" dir="ltr" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
                aria-invalid={Boolean(qIssue)} className={cn((tried || quantity !== '1') && qIssue && invalidFieldClass)} />
            </FormField>
            <FormField id="charge-note" label={t('kitchenSales.charge.note')} optional>
              <Input id="charge-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
          </div>

          <dl className="space-y-1.5 rounded-xl bg-surface-high p-3.5 text-sm" aria-live="polite" data-testid="charge-preview">
            <div className="flex justify-between gap-2">
              <dt className="text-on-surface-variant">{t('kitchenSales.charge.price', { quantity: qIssue ? 0 : quantity, unit: item.unit })}</dt>
              <dd className="tabular-nums text-on-surface">{money(preview.gross)}</dd>
            </div>
            {discount ? (
              <div className="flex justify-between gap-2 text-success">
                <dt>{t('kitchenSales.charge.discount', { name: isArabic ? discount.nameAr : discount.nameEn, percent: discount.percent })}</dt>
                <dd className="tabular-nums">−{money(preview.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2 border-t border-outline-variant pt-1.5 font-semibold">
              <dt className="text-on-surface">{t('kitchenSales.charge.total')}</dt>
              <dd className="tabular-nums text-on-surface">{money(preview.net)}</dd>
            </div>
            <p className="text-xs text-on-surface-variant">{t(consumer === 'staff' ? 'kitchenSales.charge.staffBilling' : 'kitchenSales.charge.childBilling')}</p>
          </dl>

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={run.isPending}>{run.isPending ? t('common.saving') : t('kitchenSales.charge.record')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
