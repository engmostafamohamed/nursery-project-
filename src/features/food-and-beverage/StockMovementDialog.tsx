import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { useMoney } from '@/features/kitchen-sales/kitchenLook';
import { cn } from '@/lib/utils';

import { movementIssue, quantityAfter, restockIssue, SUPPLIER_MAX, type KitchenItem, type MovementKind } from './kitchen';
import { recordStockMovement, stockErrorKey, type StockClass, type StockPerson } from './mealPlansApi';
import { localName } from '@/lib/bilingualName';
import { useKitchenChange } from './useMealPlansAndKitchen';

export type MovementMode = 'restock' | 'take' | 'count';
const TAKE_KINDS: MovementKind[] = ['issued', 'used', 'spoiled'];
const KIND_ICON: Partial<Record<MovementKind, string>> = { issued: 'outbox', used: 'remove_circle', spoiled: 'delete' };

/**
 * One change to an item's stock: a delivery (in packs too, with who supplied it, what a unit cost
 * and its expiry date); stock going out: issued to a class or a member of staff (who took it), used,
 * or thrown away or broken; or a count of what is really there. Shows the quantity it will leave;
 * every problem shows under its field as it is typed.
 */
export function StockMovementDialog({ nurseryId, item, mode, classes, staff, onClose }: {
  nurseryId: string;
  item: KitchenItem;
  mode: MovementMode;
  classes: StockClass[];
  staff: StockPerson[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const [kind, setKind] = useState<MovementKind>(mode === 'restock' ? 'restocked' : mode === 'count' ? 'counted' : item.section === 'store' ? 'issued' : 'used');
  const [quantity, setQuantity] = useState('');
  // A delivery can be counted in packs (10 cartons of 12 = 120 bottles).
  const packSize = item.packSize && item.packUnit ? item.packSize : null;
  const [inPacks, setInPacks] = useState(mode === 'restock' && packSize !== null);
  const units = inPacks && packSize && /^\d+(\.\d{1,2})?$/.test(quantity.trim()) ? String(Math.round(Number(quantity) * packSize * 100) / 100) : quantity;
  const [expiresOn, setExpiresOn] = useState('');
  const [unitCost, setUnitCost] = useState(item.unitCost === null ? '' : String(item.unitCost));
  const [supplier, setSupplier] = useState('');
  const [classId, setClassId] = useState('');
  const [takenBy, setTakenBy] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const issue = movementIssue(kind, units, item.quantity);
  const showIssue = issue && (tried || quantity !== '');
  const costIssue = kind === 'restocked' ? restockIssue(unitCost, supplier) : null;
  const targetIssue = kind === 'issued' && !classId && !takenBy ? 'target_required' : null;
  const deliveryTotal = kind === 'restocked' && !issue && !costIssue && unitCost.trim() ? Math.round(Number(units) * Number(unitCost) * 100) / 100 : null;

  const save = useKitchenChange(nurseryId, () => recordStockMovement({
    itemId: item.id,
    kind,
    quantity: Number(units),
    expiresOn: kind === 'restocked' ? expiresOn : null,
    note,
    classId: kind === 'issued' ? classId : null,
    takenBy: kind === 'issued' ? takenBy : null,
    unitCost: kind === 'restocked' && unitCost.trim() ? Number(unitCost) : null,
    supplier: kind === 'restocked' ? supplier : null,
  }));

  const submit = async () => {
    setTried(true);
    if (issue || costIssue || targetIssue || save.isPending) return;
    setProblem(null);
    try {
      await save.mutateAsync(undefined);
      toast.success(t('fnb.kitchen.movementSaved'));
      onClose();
    } catch (e) {
      setProblem(t(stockErrorKey(e), { quantity: item.quantity, unit: item.unit }));
    }
  };

  const personName = (p: { nameAr: string; nameEn: string }) => localName(p.nameAr, p.nameEn, isArabic) || '—';

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto" data-testid="stock-movement-dialog">
        <DialogHeader>
          <DialogTitle>{t(`fnb.kitchen.modes.${mode}`)} · {item.name}</DialogTitle>
          <DialogDescription>
            {t('fnb.kitchen.inStock', { quantity: item.quantity, unit: item.unit })}
            {item.location ? ` · ${item.location}` : ''}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {mode === 'take' ? (
            <div role="radiogroup" className="grid grid-cols-3 gap-2" aria-label={t('fnb.kitchen.why')}>
              {TAKE_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={cn('flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm',
                    kind === k ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary/50')}>
                  <MaterialSymbol name={KIND_ICON[k] ?? 'remove'} size="text-xl" />
                  {t(`stock.takeKinds.${k}`)}
                </button>
              ))}
            </div>
          ) : null}

          {kind === 'issued' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="movement-class" label={t('stock.issue.class')} optional error={tried && targetIssue ? t('stock.issue.targetRequired') : null}>
                <Select id="movement-class" value={classId} onChange={(e) => setClassId(e.target.value)} className={cn(tried && targetIssue && invalidFieldClass)}>
                  <option value="">{t('stock.issue.noClass')}</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
                </Select>
              </FormField>
              <FormField id="movement-taken-by" label={t('stock.issue.takenBy')} optional hint={t('stock.issue.takenByHint')}>
                <Select id="movement-taken-by" value={takenBy} onChange={(e) => setTakenBy(e.target.value)} className={cn(tried && targetIssue && invalidFieldClass)}>
                  <option value="">{t('stock.issue.nobody')}</option>
                  {staff.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
                </Select>
              </FormField>
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="movement-quantity">{mode === 'count' ? t('fnb.kitchen.countedQuantity') : t('fnb.kitchen.quantity')}</Label>
              {kind === 'restocked' && packSize ? (
                <span className="inline-flex rounded-full border border-outline-variant p-0.5 text-xs" role="radiogroup" aria-label={t('kitchenSales.packs.countIn')}>
                  {[false, true].map((packs) => (
                    <button key={String(packs)} type="button" role="radio" aria-checked={inPacks === packs} onClick={() => setInPacks(packs)}
                      className={cn('rounded-full px-2.5 py-1 font-medium', inPacks === packs ? 'bg-primary text-primary-foreground' : 'text-on-surface-variant')}>
                      {packs ? t('kitchenSales.packs.inPacks', { pack: item.packUnit, size: packSize, unit: item.unit }) : item.unit}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
            <div className="relative">
              <Input id="movement-quantity" autoFocus inputMode="decimal" dir="ltr" value={quantity} aria-invalid={Boolean(showIssue)}
                aria-describedby={showIssue ? 'movement-quantity-error' : 'movement-after'} className={cn('pe-20', showIssue && invalidFieldClass)}
                onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))} />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">{inPacks ? item.packUnit : item.unit}</span>
            </div>
            {showIssue ? (
              <p id="movement-quantity-error" role="alert" className="text-xs text-error">
                {t(`fnb.kitchen.quantityIssues.${issue}`, { quantity: item.quantity, unit: item.unit })}
              </p>
            ) : quantity ? (
              <p id="movement-after" className="flex items-center gap-1 text-xs text-on-surface-variant">
                <MaterialSymbol name="arrow_forward" size="text-sm" className="rtl:rotate-180" />
                {inPacks ? `${t('kitchenSales.packs.equals', { quantity: units, unit: item.unit })} · ` : ''}
                {t('fnb.kitchen.after', { quantity: quantityAfter(kind, Number(units), item.quantity), unit: item.unit })}
              </p>
            ) : null}
          </div>

          {kind === 'restocked' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="movement-supplier" label={t('stock.delivery.supplier')} optional
                  error={costIssue === 'supplier_too_long' ? t('stock.delivery.supplierTooLong', { max: SUPPLIER_MAX }) : null}>
                  <Input id="movement-supplier" value={supplier} maxLength={SUPPLIER_MAX + 10} placeholder={t('stock.delivery.supplierPlaceholder')}
                    aria-invalid={costIssue === 'supplier_too_long'} className={cn(costIssue === 'supplier_too_long' && invalidFieldClass)} onChange={(e) => setSupplier(e.target.value)} />
                </FormField>
                <FormField id="movement-cost" label={t('stock.delivery.unitCost', { unit: item.unit })} optional
                  error={costIssue === 'price_invalid' ? t('fnb.kitchen.issues.price_invalid') : null} hint={item.unitCost !== null ? t('stock.delivery.lastCost', { amount: money(item.unitCost) }) : undefined}>
                  <div className="relative">
                    <Input id="movement-cost" inputMode="decimal" dir="ltr" value={unitCost} aria-invalid={costIssue === 'price_invalid'}
                      className={cn('pe-14', costIssue === 'price_invalid' && invalidFieldClass)} onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ''))} />
                    <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">{t('kitchenSales.currency')}</span>
                  </div>
                </FormField>
              </div>
              {deliveryTotal !== null ? (
                <p className="flex items-center justify-between rounded-xl bg-surface-high px-3.5 py-2.5 text-sm" aria-live="polite">
                  <span className="text-on-surface-variant">{t('stock.delivery.total')}</span>
                  <b className="tabular-nums text-on-surface">{money(deliveryTotal)}</b>
                </p>
              ) : null}
              <FormField id="movement-expiry" label={t('fnb.kitchen.expiry')} optional hint={t('fnb.kitchen.expiryRestockHint')}>
                <Input id="movement-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              </FormField>
            </>
          ) : null}

          <FormField id="movement-note" label={t('fnb.kitchen.note')} optional>
            <Input id="movement-note" maxLength={300} value={note}
              placeholder={kind === 'issued' ? t('stock.issue.notePlaceholder') : kind === 'spoiled' ? t('stock.spoiledPlaceholder') : t('fnb.kitchen.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)} />
          </FormField>

          <FormProblem message={problem} />
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>{save.isPending ? t('fnb.editor.saving') : t('fnb.kitchen.record')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
