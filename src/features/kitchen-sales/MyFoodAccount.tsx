import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { BILLING_LOOK, newTakingKey, useMoney } from './kitchenLook';
import { chargePreview, quantityIssue, type StaffItem } from './kitchenSales';
import { chargeStaffItem, errorDetail, kitchenErrorKey } from './kitchenSalesApi';
import { MonthSwitcher } from './MonthSwitcher';
import { useKitchenSale, useMyKitchenAccount } from './useKitchenSales';

/**
 * A member of staff's food and drinks account: what they took this month (with any discount), what
 * is still open (deducted from their next payslip) and what was deducted, and recording what they take.
 */
export function MyFoodAccount({ thisMonth }: { thisMonth: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const [month, setMonth] = useState(thisMonth);
  const [taking, setTaking] = useState(false);
  const query = useMyKitchenAccount(month);
  const data = query.data;

  return (
    <section aria-labelledby="my-food-account" className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5" data-testid="my-food-account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="my-food-account" className="flex items-center gap-2 font-semibold text-on-surface">
            <MaterialSymbol name="account_balance_wallet" size="text-xl" className="text-primary" />
            {t('kitchenSales.mine.title')}
          </h2>
          <p className="text-xs text-on-surface-variant">{t('kitchenSales.mine.hint')}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setTaking(true)} disabled={!data?.items.length} data-testid="take-for-myself">
          <MaterialSymbol name="add" size="text-base" className="me-1" />
          {t('kitchenSales.mine.take')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-high p-3">
        <span className="text-sm text-on-surface-variant">{t('kitchenSales.mine.open')}</span>
        <span className={cn('text-lg font-bold tabular-nums', data?.openTotal ? 'text-warning' : 'text-on-surface')} data-testid="my-open-total">{money(data?.openTotal ?? 0)}</span>
      </div>

      <MonthSwitcher month={month} max={thisMonth} onChange={setMonth} />

      {query.isPending ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-error">{t(kitchenErrorKey(query.error))}</p>
      ) : !data?.charges.length ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-5 text-center text-sm text-on-surface-variant">{t('kitchenSales.mine.empty')}</p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
          {(data?.charges ?? []).map((c) => {
            const look = BILLING_LOOK[c.billing];
            const payslip = data?.payslipMonths[c.id];
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-on-surface">{c.itemName} × {c.quantity}</span>
                  <span className="block text-xs text-on-surface-variant">
                    {formatDay(c.chargedOn, { day: 'numeric', month: 'short' })}
                    {c.discountAmount > 0 ? ` · ${(isArabic ? c.discountNameAr : c.discountNameEn) ?? ''} −${money(c.discountAmount)}` : ''}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-on-surface">{money(c.net)}</span>
                <StatusPill tone={look.tone} icon={look.icon}>
                  {c.billing === 'deducted' && payslip ? t('kitchenSales.mine.deductedIn', { month: formatDay(`${payslip}-01`, { month: 'long' }) }) : t(`kitchenSales.billing.${c.billing}`)}
                </StatusPill>
              </li>
            );
          })}
        </ul>
      )}
      {taking && data ? <TakeForMyselfDialog items={data.items} onClose={() => setTaking(false)} /> : null}
    </section>
  );
}

/** Recording what a member of staff takes for themselves, priced with their discount. */
function TakeForMyselfDialog({ items, onClose }: { items: StaffItem[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const [itemId, setItemId] = useState(items.find((i) => i.inStock)?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const key = useRef(newTakingKey());
  const item = items.find((i) => i.id === itemId) ?? null;
  const qIssue = item ? quantityIssue(quantity, item.quantity) : null;
  const preview = item ? chargePreview(item.price, qIssue ? 0 : Number(quantity), item.discountPercent) : null;
  const run = useKitchenSale(() => chargeStaffItem({ itemId, quantity: Number(quantity), key: key.current }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!item || qIssue || run.isPending) return;
    setProblem(null);
    try {
      await run.mutateAsync(undefined);
      toast.success(t('kitchenSales.mine.recorded'));
      onClose();
    } catch (error) {
      setProblem(t(kitchenErrorKey(error), { quantity: errorDetail(error), unit: item.unit }));
      key.current = newTakingKey();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="take-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('kitchenSales.mine.take')}</DialogTitle>
            <DialogDescription>{t('kitchenSales.mine.takeHint')}</DialogDescription>
          </DialogHeader>
          <FormField id="take-item" label={t('kitchenSales.mine.item')} error={tried && !item ? t('kitchenSales.issues.item_required') : null}>
            <Select id="take-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">{t('kitchenSales.mine.chooseItem')}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id} disabled={!i.inStock}>
                  {i.name} · {money(i.finalPrice)}{i.inStock ? '' : ` · ${t('kitchenSales.give.outOfStock')}`}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="take-quantity" label={t('kitchenSales.charge.quantity', { unit: item?.unit ?? '' })}
            error={item && qIssue && (tried || quantity !== '1') ? t(`kitchenSales.quantityIssues.${qIssue}`, { quantity: item.quantity, unit: item.unit, max: 1000 }) : null}>
            <Input id="take-quantity" inputMode="decimal" dir="ltr" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
              className={cn(item && qIssue && (tried || quantity !== '1') && invalidFieldClass)} />
          </FormField>
          {item && preview ? (
            <dl className="space-y-1 rounded-xl bg-surface-high p-3 text-sm" aria-live="polite">
              <div className="flex justify-between"><dt className="text-on-surface-variant">{t('kitchenSales.charge.price', { quantity: qIssue ? 0 : quantity, unit: item.unit })}</dt><dd className="tabular-nums">{money(preview.gross)}</dd></div>
              {item.discountPercent > 0 ? (
                <div className="flex justify-between text-success"><dt>{t('kitchenSales.charge.discount', { name: isArabic ? item.discountNameAr : item.discountNameEn, percent: item.discountPercent })}</dt><dd className="tabular-nums">−{money(preview.discount)}</dd></div>
              ) : null}
              <div className="flex justify-between border-t border-outline-variant pt-1 font-semibold"><dt>{t('kitchenSales.charge.total')}</dt><dd className="tabular-nums">{money(preview.net)}</dd></div>
            </dl>
          ) : null}
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
