import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { movementIssue, quantityAfter, type KitchenItem, type MovementKind } from './kitchen';
import { fnbErrorKey, recordStockMovement } from './mealPlansApi';
import { useKitchenChange } from './useMealPlansAndKitchen';

export type MovementMode = 'restock' | 'take' | 'count';
const KINDS: Record<MovementMode, MovementKind[]> = { restock: ['restocked'], take: ['used', 'spoiled'], count: ['counted'] };

/**
 * One change to an item's stock: a delivery (with its expiry date), what was used or thrown away,
 * or a count of what is really there. Shows the quantity it will leave; taking more than there is
 * shows under the field.
 */
export function StockMovementDialog({ nurseryId, item, mode, onClose }: { nurseryId: string; item: KitchenItem; mode: MovementMode; onClose: () => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<MovementKind>(KINDS[mode][0]);
  const [quantity, setQuantity] = useState('');
  // A delivery can be counted in packs (10 cartons of 12 = 120 bottles).
  const packSize = item.packSize && item.packUnit ? item.packSize : null;
  const [inPacks, setInPacks] = useState(mode === 'restock' && packSize !== null);
  const units = inPacks && packSize && /^\d+(\.\d{1,2})?$/.test(quantity.trim()) ? String(Math.round(Number(quantity) * packSize * 100) / 100) : quantity;
  const [expiresOn, setExpiresOn] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const issue = movementIssue(kind, units, item.quantity);
  const showIssue = issue && (tried || quantity !== '');
  const save = useKitchenChange(nurseryId, () => recordStockMovement({ itemId: item.id, kind, quantity: Number(units), expiresOn: kind === 'restocked' ? expiresOn : null, note }));

  const submit = async () => {
    setTried(true);
    if (issue) return;
    try {
      await save.mutateAsync(undefined);
      toast.success(t('fnb.kitchen.movementSaved'));
      onClose();
    } catch (e) {
      toast.error(t(fnbErrorKey(e)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`fnb.kitchen.modes.${mode}`)} · {item.name}</DialogTitle>
          <DialogDescription>{t('fnb.kitchen.inStock', { quantity: item.quantity, unit: item.unit })}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {KINDS[mode].length > 1 ? (
            <div role="radiogroup" className="grid grid-cols-2 gap-2" aria-label={t('fnb.kitchen.why')}>
              {KINDS[mode].map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={cn('rounded-xl border p-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    kind === k ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant')}>
                  {t(`fnb.kitchen.kinds.${k}`)}
                </button>
              ))}
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
              <Input id="movement-quantity" autoFocus inputMode="decimal" value={quantity} aria-invalid={Boolean(showIssue)}
                aria-describedby={showIssue ? 'movement-quantity-error' : 'movement-after'} className={cn('pe-16', showIssue && 'border-error')}
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
            <div className="space-y-1">
              <Label htmlFor="movement-expiry">{t('fnb.kitchen.expiry')}</Label>
              <Input id="movement-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              <p className="text-xs text-on-surface-variant">{t('fnb.kitchen.expiryRestockHint')}</p>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="movement-note">{t('fnb.kitchen.note')}</Label>
            <Input id="movement-note" maxLength={300} value={note} placeholder={t('fnb.kitchen.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>{save.isPending ? t('fnb.editor.saving') : t('fnb.kitchen.record')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
