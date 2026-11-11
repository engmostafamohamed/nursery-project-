import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { localName } from '@/lib/bilingualName';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { EXTRA_ICON, REQUEST_LOOK, useMoney } from './kitchenLook';
import { sortRequests, type ExtraItem, type ExtraRequest, type FamilyChildExtras } from './kitchenSales';
import { cancelChildExtra, decideChildExtra, kitchenErrorKey } from './kitchenSalesApi';
import { OrderExtraDialog } from './OrderExtraDialog';
import { useFamilyExtras, useKitchenSale } from './useKitchenSales';

/**
 * For a parent: each child's extras. What a teacher asks to give (yes or no), the menu of extras
 * priced for the child (the ones with a food they are allergic to marked and not orderable), ordering
 * for chosen days, and the orders with where each stands. Served extras go on the monthly food invoice.
 */
export function FamilyExtrasPanel({ focus = false }: { focus?: boolean }) {
  const { t } = useTranslation();
  const query = useFamilyExtras();
  const ref = useRef<HTMLElement>(null);
  const [ordering, setOrdering] = useState<{ child: FamilyChildExtras; item: ExtraItem } | null>(null);

  // A notification about extras opens the page here.
  useEffect(() => {
    if (focus && query.data) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, query.data]);

  const children = (query.data ?? []).filter((c) => c.extras.length || c.requests.length);
  if (!query.isPending && !query.isError && !children.length) return null;

  return (
    <section ref={ref} aria-labelledby="family-extras" className="scroll-mt-24 space-y-4 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5" data-testid="family-extras">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="family-extras" className="flex items-center gap-2 font-semibold text-on-surface">
            <MaterialSymbol name="cookie" size="text-xl" className="text-primary" />
            {t('kitchenSales.parent.title')}
          </h2>
          <p className="text-xs text-on-surface-variant">{t('kitchenSales.parent.hint')}</p>
        </div>
        <Link to="/parent/invoices" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <MaterialSymbol name="receipt_long" size="text-base" />
          {t('kitchenSales.parent.invoices')}
        </Link>
      </div>
      {query.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-error">{t(kitchenErrorKey(query.error))}</p>
      ) : (
        children.map((child) => <ChildExtras key={child.childId} child={child} showName={children.length > 1} onOrder={(item) => setOrdering({ child, item })} />)
      )}
      {ordering ? <OrderExtraDialog child={ordering.child} item={ordering.item} onClose={() => setOrdering(null)} /> : null}
    </section>
  );
}

function ChildExtras({ child, showName, onOrder }: { child: FamilyChildExtras; showName: boolean; onOrder: (item: ExtraItem) => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const name = (localName(child.nameAr, child.nameEn, isArabic)) || '—';
  const waiting = child.requests.filter((r) => r.status === 'waiting_parent' && r.forDate >= child.today);
  const others = sortRequests(child.requests.filter((r) => !(r.status === 'waiting_parent' && r.forDate >= child.today)));

  return (
    <div className="space-y-3" data-testid="child-extras">
      {showName ? <h3 className="text-sm font-semibold text-on-surface">{name}</h3> : null}

      {waiting.map((r) => <WaitingRequest key={r.id} request={r} childName={name} />)}

      {child.extras.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {child.extras.map((item) => {
            const blocked = item.conflicts.length > 0;
            return (
              <li key={item.id} className={cn('flex flex-col gap-2 rounded-xl border p-3', blocked ? 'border-error/30 bg-error/5' : 'border-outline-variant')}>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                    <MaterialSymbol name={EXTRA_ICON[item.kind]} size="text-lg" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-on-surface">{item.name}</span>
                    <span className="block text-xs text-on-surface-variant">{t(`kitchenSales.kinds.${item.kind}`)}</span>
                  </span>
                  <span className="text-end">
                    <span className="block text-sm font-bold tabular-nums text-on-surface">{money(item.finalPrice)}</span>
                    {item.discountPercent > 0 ? <span className="block text-xs text-on-surface-variant line-through tabular-nums">{money(item.price)}</span> : null}
                  </span>
                </div>
                {blocked ? (
                  <p className="flex items-center gap-1 text-xs font-medium text-error">
                    <MaterialSymbol name="warning" size="text-sm" />
                    {t('kitchenSales.give.allergic', { foods: item.conflicts.map((f) => t(`fnb.allergens.${f}`)).join('، ') })}
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-on-surface-variant">{item.preApproved ? t('kitchenSales.parent.preApproved') : t('kitchenSales.parent.asksYou')}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => onOrder(item)} disabled={!item.inStock || !child.openDays.length}>
                      {item.inStock ? t('kitchenSales.parent.order') : t('kitchenSales.give.outOfStock')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {others.length ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('kitchenSales.parent.orders')}</p>
          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
            {others.slice(0, 12).map((r) => <OrderRow key={r.id} request={r} today={child.today} childName={name} />)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function WaitingRequest({ request, childName }: { request: ExtraRequest; childName: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const decide = useKitchenSale((approve: boolean) => decideChildExtra(request.id, approve));
  const by = (localName(request.byAr, request.byEn, isArabic)) || t('kitchenSales.parent.theTeacher');
  const answer = async (approve: boolean) => {
    try {
      await decide.mutateAsync(approve);
      toast.success(t(approve ? 'kitchenSales.parent.approved' : 'kitchenSales.parent.declined'));
    } catch (error) {
      toast.error(t(kitchenErrorKey(error)));
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3.5 sm:flex-row sm:items-center" data-testid="waiting-extra">
      <MaterialSymbol name="hourglass_top" size="text-xl" className="text-warning" />
      <p className="flex-1 text-sm text-on-surface">
        {t('kitchenSales.parent.askedBy', { by, item: request.itemName, quantity: request.quantity, child: childName })}
        {request.note ? <span className="block text-xs text-on-surface-variant">“{request.note}”</span> : null}
      </p>
      <span className="flex gap-2">
        <Button type="button" size="sm" onClick={() => void answer(true)} disabled={decide.isPending}>{t('kitchenSales.parent.approve')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void answer(false)} disabled={decide.isPending}>{t('kitchenSales.parent.decline')}</Button>
      </span>
    </div>
  );
}

function OrderRow({ request, today, childName }: { request: ExtraRequest; today: string; childName: string }) {
  const { t } = useTranslation();
  const money = useMoney();
  const look = REQUEST_LOOK[request.status];
  const cancel = useKitchenSale(() => cancelChildExtra(request.id));
  const canCancel = (request.status === 'approved' || request.status === 'waiting_parent') && request.forDate >= today;
  const doCancel = async () => {
    const ok = await confirm({
      title: t('kitchenSales.extras.cancelTitle'),
      description: t('kitchenSales.extras.cancelBody', { item: request.itemName, child: childName }),
      confirmText: t('kitchenSales.extras.cancel'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync(undefined);
      toast.success(t('kitchenSales.extras.cancelled'));
    } catch (error) {
      toast.error(t(kitchenErrorKey(error)));
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm" data-testid="extra-order">
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-on-surface">{request.itemName} × {request.quantity}</span>
        <span className="block text-xs text-on-surface-variant">
          {request.forDate === today ? t('kitchenSales.parent.today') : formatDay(request.forDate, { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}{t(`kitchenSales.extras.sources.${request.source}`)}
        </span>
      </span>
      {request.amount !== null ? <span className="font-semibold tabular-nums text-on-surface">{money(request.amount)}</span> : null}
      <StatusPill tone={look.tone} icon={look.icon}>{t(`kitchenSales.extras.statuses.${request.status}`)}</StatusPill>
      {canCancel ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => void doCancel()} disabled={cancel.isPending}>{t('kitchenSales.extras.cancel')}</Button>
      ) : null}
    </li>
  );
}
