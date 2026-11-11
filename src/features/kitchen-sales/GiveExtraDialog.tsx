import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { EXTRA_ICON, newTakingKey, useMoney } from './kitchenLook';
import { allergyConflicts, MAX_EXTRA_QUANTITY, preApproved, type ClassChildExtras, type ExtraItem } from './kitchenSales';
import { errorDetail, giveChildExtra, kitchenErrorKey } from './kitchenSalesApi';
import { useKitchenSale } from './useKitchenSales';

/**
 * A teacher gives a child an extra from the menu's extras. Items with a food the child is allergic
 * to, or out of stock, cannot be chosen. It is served (and charged) at once when the parents agreed
 * at enrollment; otherwise the parent is asked first, and it shows as waiting.
 */
export function GiveExtraDialog({ child, items, onClose }: { child: ClassChildExtras; items: ExtraItem[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const key = useRef(newTakingKey());
  const item = items.find((i) => i.id === itemId) ?? null;
  const childName = (localName(child.nameAr, child.nameEn, isArabic)) || '—';
  const run = useKitchenSale(() => giveChildExtra({ childId: child.childId, itemId, quantity, note, key: key.current }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!item || run.isPending) return;
    setProblem(null);
    try {
      const result = await run.mutateAsync(undefined);
      toast.success(t(result.status === 'served' ? 'kitchenSales.give.served' : 'kitchenSales.give.asked', { item: item.name, child: childName }));
      onClose();
    } catch (error) {
      const detail = errorDetail(error);
      setProblem(t(kitchenErrorKey(error), {
        quantity: detail,
        unit: item.unit,
        foods: detail.split(',').filter(Boolean).map((f) => t(`fnb.allergens.${f}`, { defaultValue: f })).join('، '),
      }));
      key.current = newTakingKey();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto" data-testid="give-extra-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t('kitchenSales.give.title', { child: childName })}</DialogTitle>
            <DialogDescription>{t('kitchenSales.give.hint')}</DialogDescription>
          </DialogHeader>

          {!items.length ? (
            <p className="rounded-xl border border-dashed border-outline-variant p-4 text-center text-sm text-on-surface-variant">{t('kitchenSales.give.noItems')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('kitchenSales.give.choose')}>
              {items.map((i) => {
                const conflicts = allergyConflicts(i.allergens, child.allergens);
                const disabled = conflicts.length > 0 || !i.inStock;
                const selected = itemId === i.id;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => setItemId(i.id)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-xl border p-3 text-start transition-colors disabled:cursor-not-allowed',
                        selected ? 'border-primary bg-primary/10' : 'border-outline-variant hover:border-primary/60',
                        disabled && 'opacity-60',
                      )}
                    >
                      <MaterialSymbol name={EXTRA_ICON[i.kind]} size="text-xl" className="mt-0.5 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-on-surface">{i.name}</span>
                        <span className="block text-xs text-on-surface-variant">{money(i.price)} · {t(`kitchenSales.kinds.${i.kind}`)}</span>
                        {conflicts.length ? (
                          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-error">
                            <MaterialSymbol name="warning" size="text-sm" />
                            {t('kitchenSales.give.allergic', { foods: conflicts.map((f) => t(`fnb.allergens.${f}`)).join('، ') })}
                          </span>
                        ) : !i.inStock ? (
                          <span className="mt-1 block text-xs font-medium text-error">{t('kitchenSales.give.outOfStock')}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {tried && !item ? <p role="alert" className="text-xs text-error">{t('kitchenSales.issues.item_required')}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="give-quantity" label={t('kitchenSales.give.quantity')}>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={t('kitchenSales.give.less')}>−</Button>
                <span id="give-quantity" className="min-w-8 text-center text-lg font-bold tabular-nums">{quantity}</span>
                <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => setQuantity((q) => Math.min(MAX_EXTRA_QUANTITY, q + 1))} aria-label={t('kitchenSales.give.more')}>+</Button>
              </div>
            </FormField>
            <FormField id="give-note" label={t('kitchenSales.charge.note')} optional>
              <Input id="give-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('kitchenSales.give.notePlaceholder')} />
            </FormField>
          </div>

          {item ? (
            <p className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', preApproved(item.kind, child.consent) ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')} aria-live="polite">
              <MaterialSymbol name={preApproved(item.kind, child.consent) ? 'verified' : 'hourglass_top'} size="text-lg" />
              {preApproved(item.kind, child.consent)
                ? t('kitchenSales.give.willServe', { amount: money(item.price * quantity) })
                : t('kitchenSales.give.willAsk', { amount: money(item.price * quantity) })}
            </p>
          ) : null}

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={run.isPending || !items.length}>
              {run.isPending ? t('common.saving') : item && !preApproved(item.kind, child.consent) ? t('kitchenSales.give.askParent') : t('kitchenSales.give.give')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
