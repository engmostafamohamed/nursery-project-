import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { EXTRA_ICON, useMoney } from './kitchenLook';
import { MAX_EXTRA_QUANTITY, orderIssues, type ExtraItem, type FamilyChildExtras, type OrderDraft } from './kitchenSales';
import { kitchenErrorKey, orderChildExtra } from './kitchenSalesApi';
import { useKitchenSale } from './useKitchenSales';

/** How many open days the parent can pick from at once. */
const DAYS_SHOWN = 14;

/**
 * A parent orders an extra for their child on one or more open days. The price shown is the child's
 * (with any discount); it goes on the family's monthly food invoice once it is served on the day.
 */
export function OrderExtraDialog({ child, item, onClose }: { child: FamilyChildExtras; item: ExtraItem; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const [draft, setDraft] = useState<OrderDraft>({ itemId: item.id, quantity: '1', dates: child.openDays.includes(child.today) ? [child.today] : [], note: '' });
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const issues = orderIssues(draft);
  const run = useKitchenSale(() => orderChildExtra({ childId: child.childId, itemId: item.id, quantity: Number(draft.quantity), dates: draft.dates, note: draft.note }));
  const days = child.openDays.slice(0, DAYS_SHOWN);
  const quantity = Number(draft.quantity) || 0;
  const total = Math.round(item.finalPrice * quantity * draft.dates.length * 100) / 100;
  const childName = (isArabic ? child.nameAr || child.nameEn : child.nameEn || child.nameAr) || '—';

  const toggleDay = (day: string) =>
    setDraft((d) => ({ ...d, dates: d.dates.includes(day) ? d.dates.filter((x) => x !== day) : [...d.dates, day].sort() }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(issues).length || run.isPending) return;
    setProblem(null);
    try {
      const count = await run.mutateAsync(undefined);
      toast.success(t('kitchenSales.parent.ordered', { count, item: item.name, child: childName }));
      onClose();
    } catch (error) {
      setProblem(t(kitchenErrorKey(error), { foods: '', quantity: '', unit: item.unit }));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto" data-testid="order-extra-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MaterialSymbol name={EXTRA_ICON[item.kind]} size="text-xl" className="text-primary" />
              {t('kitchenSales.parent.orderTitle', { item: item.name, child: childName })}
            </DialogTitle>
            <DialogDescription>{t('kitchenSales.parent.orderHint')}</DialogDescription>
          </DialogHeader>

          <FormField id="order-quantity" label={t('kitchenSales.give.quantity')} error={tried && issues.quantity ? t(`kitchenSales.issues.${issues.quantity}`, { max: MAX_EXTRA_QUANTITY }) : null}>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => setDraft((d) => ({ ...d, quantity: String(Math.max(1, (Number(d.quantity) || 1) - 1)) }))} aria-label={t('kitchenSales.give.less')}>−</Button>
              <span id="order-quantity" className="min-w-8 text-center text-lg font-bold tabular-nums">{draft.quantity}</span>
              <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => setDraft((d) => ({ ...d, quantity: String(Math.min(MAX_EXTRA_QUANTITY, (Number(d.quantity) || 0) + 1)) }))} aria-label={t('kitchenSales.give.more')}>+</Button>
              <span className="text-sm text-on-surface-variant">× {money(item.finalPrice)}</span>
            </div>
          </FormField>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-on-surface">{t('kitchenSales.parent.whichDays')}</legend>
            {days.length ? (
              <div className="flex flex-wrap gap-1.5" data-testid="order-days">
                {days.map((day) => {
                  const on = draft.dates.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(day)}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-center text-xs font-medium transition-colors',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-on-surface hover:border-primary/60',
                      )}
                    >
                      <span className="block">{day === child.today ? t('kitchenSales.parent.today') : formatDay(day, { weekday: 'short' })}</span>
                      <span className="block text-[11px] opacity-80">{formatDay(day, { day: 'numeric', month: 'short' })}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">{t('kitchenSales.parent.noOpenDays')}</p>
            )}
            {tried && issues.dates ? <p role="alert" className="text-xs text-error">{t(`kitchenSales.issues.${issues.dates}`)}</p> : null}
          </fieldset>

          <FormField id="order-note" label={t('kitchenSales.charge.note')} optional error={tried && issues.note ? t(`kitchenSales.issues.${issues.note}`) : null}>
            <Input id="order-note" maxLength={200} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder={t('kitchenSales.parent.notePlaceholder')} />
          </FormField>

          <div className="flex items-center justify-between rounded-xl bg-surface-high p-3 text-sm" aria-live="polite">
            <span className="text-on-surface-variant">{t('kitchenSales.parent.total', { count: draft.dates.length })}</span>
            <span className="text-base font-bold tabular-nums text-on-surface">{money(total)}</span>
          </div>
          {item.discountPercent > 0 ? (
            <p className="text-xs text-success">{t('kitchenSales.parent.discountApplied', { name: isArabic ? item.discountNameAr : item.discountNameEn, percent: item.discountPercent })}</p>
          ) : null}

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={run.isPending}>{run.isPending ? t('common.saving') : t('kitchenSales.parent.confirmOrder')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
