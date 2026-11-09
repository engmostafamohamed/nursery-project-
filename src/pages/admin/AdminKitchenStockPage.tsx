import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { KitchenItemDialog } from '@/features/food-and-beverage/KitchenItemDialog';
import { KitchenStockPanel } from '@/features/food-and-beverage/KitchenStockPanel';
import { useKitchenStock } from '@/features/food-and-beverage/useMealPlansAndKitchen';
import { ExtrasTodayPanel } from '@/features/kitchen-sales/ExtrasTodayPanel';
import { KitchenDiscountsPanel } from '@/features/kitchen-sales/KitchenDiscountsPanel';
import { KitchenSalesPanel } from '@/features/kitchen-sales/KitchenSalesPanel';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';

const TABS = [
  { key: 'stock', icon: 'inventory_2' },
  { key: 'sales', icon: 'point_of_sale' },
  { key: 'extras', icon: 'cookie' },
  { key: 'discounts', icon: 'sell' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/**
 * F&B · the kitchen: its stock (deliveries, use, counts, taking items for someone), what it sold and
 * to whom, today's extras for children, and the discounts it gives. The tab is kept in the address.
 */
export function AdminKitchenStockPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((x) => x.key === params.get('tab')) ? (params.get('tab') as Tab) : 'stock';
  const query = useKitchenStock(nurseryId);
  const [newItem, setNewItem] = useState(false);
  const thisMonth = getNurseryCalendarDateString().slice(0, 7);
  const canEdit = Boolean(query.data?.canEdit);

  return (
    <div className="space-y-5">
      <PageHeader
        icon="kitchen"
        eyebrow={t('fnb.eyebrow')}
        title={t('fnb.kitchen.title')}
        description={t('kitchenSales.page.subtitle')}
        actions={
          canEdit && tab === 'stock' ? (
            <Button type="button" onClick={() => setNewItem(true)}>
              <MaterialSymbol name="add" size="text-lg" className="me-1" />
              {t('fnb.kitchen.newItem')}
            </Button>
          ) : null
        }
      >
        {canEdit ? (
          <div role="tablist" aria-label={t('kitchenSales.page.tabs')} className="-my-1 flex gap-1 overflow-x-auto">
            {TABS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={tab === x.key}
                onClick={() => setParams(x.key === 'stock' ? {} : { tab: x.key }, { replace: true })}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  tab === x.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-on-surface-variant hover:bg-surface-high',
                )}
              >
                <MaterialSymbol name={x.icon} size="text-lg" />
                {t(`kitchenSales.page.tab.${x.key}`)}
              </button>
            ))}
          </div>
        ) : null}
      </PageHeader>

      {!nurseryId ? null : tab === 'sales' && canEdit ? (
        <KitchenSalesPanel nurseryId={nurseryId} thisMonth={thisMonth} />
      ) : tab === 'extras' && canEdit ? (
        <ExtrasTodayPanel nurseryId={nurseryId} thisMonth={thisMonth} />
      ) : tab === 'discounts' && canEdit ? (
        <KitchenDiscountsPanel nurseryId={nurseryId} thisMonth={thisMonth} items={query.data?.items ?? []} />
      ) : (
        <KitchenStockPanel nurseryId={nurseryId} data={query.data} loading={query.isLoading} thisMonth={thisMonth} onNewItem={() => setNewItem(true)} />
      )}

      {newItem && nurseryId ? <KitchenItemDialog nurseryId={nurseryId} item={null} onClose={() => setNewItem(false)} /> : null}
    </div>
  );
}
