import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import type { StockScope } from '@/features/food-and-beverage/kitchen';
import { KitchenItemDialog } from '@/features/food-and-beverage/KitchenItemDialog';
import { KitchenStockPanel } from '@/features/food-and-beverage/KitchenStockPanel';
import { StockHistoryPanel } from '@/features/food-and-beverage/StockHistoryPanel';
import { useStock } from '@/features/food-and-beverage/useMealPlansAndKitchen';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';

const TABS = [
  { key: 'stock', icon: 'inventory_2' },
  { key: 'history', icon: 'history' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/**
 * The warehouse: everything the nursery keeps, the kitchen's food and drinks and the store's
 * classroom supplies, cleaning, hygiene, first aid, toys and furniture, in one stock. Deliveries,
 * issues to classes, use, counts and sales are recorded here (the kitchen's page shows its own part,
 * with its sales, extras and discounts); the history tab shows a month of it. The tab is kept in
 * the address, and ?show=attention (the daily stock alert's link) opens what needs attention.
 */
export function AdminInventoryPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((x) => x.key === params.get('tab')) ? (params.get('tab') as Tab) : 'stock';
  const query = useStock(nurseryId, 'all');
  const [newItem, setNewItem] = useState(false);
  const thisMonth = getNurseryCalendarDateString().slice(0, 7);
  const data = query.data;
  const canEdit = Boolean(data?.canEdit);
  // A new item goes in a section the viewer may change.
  const addScope: StockScope = data?.canEditKitchen && data.canEditStore ? 'all' : data?.canEditStore ? 'store' : 'kitchen';

  return (
    <div className="space-y-5">
      <PageHeader
        icon="warehouse"
        eyebrow={t('stock.page.eyebrow')}
        title={t('stock.page.title')}
        description={t('stock.page.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            {data?.canEditKitchen ? (
              <Button asChild variant="outline">
                <Link to="/admin/kitchen?tab=sales">
                  <MaterialSymbol name="point_of_sale" size="text-lg" className="me-1" />
                  {t('stock.page.kitchenSales')}
                </Link>
              </Button>
            ) : null}
            {canEdit && tab === 'stock' ? (
              <Button type="button" onClick={() => setNewItem(true)}>
                <MaterialSymbol name="add" size="text-lg" className="me-1" />
                {t('fnb.kitchen.newItem')}
              </Button>
            ) : null}
          </div>
        }
      >
        <div role="tablist" aria-label={t('stock.page.tabs')} className="-my-1 flex gap-1 overflow-x-auto">
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
              {t(`stock.page.tab.${x.key}`)}
            </button>
          ))}
        </div>
      </PageHeader>

      {query.isError ? (
        <LoadError message={t('stock.page.loadFailed')} onRetry={() => void query.refetch()} />
      ) : null}

      {!nurseryId ? null : tab === 'history' ? (
        <StockHistoryPanel nurseryId={nurseryId} scope="all" thisMonth={thisMonth} />
      ) : (
        <KitchenStockPanel
          nurseryId={nurseryId}
          data={data}
          loading={query.isLoading}
          thisMonth={thisMonth}
          onNewItem={() => setNewItem(true)}
          scope="all"
          initialAttention={params.get('show') === 'attention' ? 'attention' : 'all'}
        />
      )}

      {newItem && nurseryId ? <KitchenItemDialog nurseryId={nurseryId} item={null} scope={addScope} onClose={() => setNewItem(false)} /> : null}
    </div>
  );
}
