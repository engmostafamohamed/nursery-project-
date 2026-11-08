import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TableLoading, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { KITCHEN_CATEGORIES, sortForAttention, stockFlags, stockTotals, type KitchenCategory, type KitchenItem } from '@/features/food-and-beverage/kitchen';
import { KitchenItemDialog } from '@/features/food-and-beverage/KitchenItemDialog';
import { deleteKitchenItem, fnbErrorKey } from '@/features/food-and-beverage/mealPlansApi';
import { localName } from '@/features/food-and-beverage/menu';
import { StockMovementDialog, type MovementMode } from '@/features/food-and-beverage/StockMovementDialog';
import { useKitchenChange, useKitchenStock } from '@/features/food-and-beverage/useMealPlansAndKitchen';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';

type Attention = 'all' | 'attention';
const CATEGORY_ICON: Record<KitchenCategory, string> = { food: 'grocery', drinks: 'local_drink', kitchen_supplies: 'soup_kitchen' };
const KIND_LOOK = { restocked: { icon: 'add_circle', tone: 'text-success' }, used: { icon: 'remove_circle', tone: 'text-primary' }, spoiled: { icon: 'delete', tone: 'text-error' }, counted: { icon: 'fact_check', tone: 'text-on-surface-variant' } } as const;

/**
 * F&B · kitchen stock: food, drinks and kitchen supplies, what is out, low or about to expire, and
 * each delivery, use and count.
 */
export function AdminKitchenStockPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { nurseryId } = useSettings();
  const query = useKitchenStock(nurseryId);
  const data = query.data;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<KitchenCategory | 'all'>('all');
  const [attention, setAttention] = useState<Attention>('all');
  const [itemDialog, setItemDialog] = useState<{ item: KitchenItem | null } | null>(null);
  const [movement, setMovement] = useState<{ item: KitchenItem; mode: MovementMode } | null>(null);
  const remove = useKitchenChange(nurseryId, (id: string) => deleteKitchenItem(id));

  const today = data?.today ?? '';
  const totals = useMemo(() => stockTotals(data?.items ?? [], today), [data?.items, today]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortForAttention(data?.items ?? [], today).filter((item) => {
      const f = stockFlags(item, today);
      return (category === 'all' || item.category === category) && (!term || item.name.toLowerCase().includes(term)) && (attention === 'all' || f.out || f.low || f.expired || f.expiringSoon);
    });
  }, [data?.items, today, search, category, attention]);

  const drop = async (item: KitchenItem) => {
    const ok = await confirm({ title: t('fnb.kitchen.deleteTitle', { name: item.name }), description: t('fnb.kitchen.deleteBody'), confirmText: t('common.delete'), icon: 'delete' });
    if (!ok) return;
    try {
      await remove.mutateAsync(item.id);
      toast.success(t('fnb.kitchen.deleted'));
    } catch (e) {
      toast.error(t(fnbErrorKey(e)));
    }
  };

  const badges = (item: KitchenItem) => {
    const f = stockFlags(item, today);
    return (
      <span className="flex flex-wrap gap-1">
        {f.expired ? <StatusPill tone="error" icon="event_busy">{t('fnb.kitchen.flags.expired')}</StatusPill> : null}
        {f.out ? <StatusPill tone="error" icon="remove_shopping_cart">{t('fnb.kitchen.flags.out')}</StatusPill> : null}
        {f.low ? <StatusPill tone="warning" icon="trending_down">{t('fnb.kitchen.flags.low')}</StatusPill> : null}
        {f.expiringSoon ? <StatusPill tone="warning" icon="schedule">{t('fnb.kitchen.flags.expiringSoon')}</StatusPill> : null}
        {!f.expired && !f.out && !f.low && !f.expiringSoon ? <StatusPill tone="success" icon="check">{t('fnb.kitchen.flags.ok')}</StatusPill> : null}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon="kitchen"
        eyebrow={t('fnb.eyebrow')}
        title={t('fnb.kitchen.title')}
        description={t('fnb.kitchen.subtitle')}
        actions={
          data?.canEdit ? (
            <Button type="button" onClick={() => setItemDialog({ item: null })}>
              <MaterialSymbol name="add" size="text-lg" className="me-1" />
              {t('fnb.kitchen.newItem')}
            </Button>
          ) : null
        }
      >
        {data ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile icon="inventory_2" label={t('fnb.kitchen.tiles.items')} value={totals.items} onClick={() => setAttention('all')} active={attention === 'all' && category === 'all'} />
            <StatTile icon="remove_shopping_cart" tone={totals.out ? 'error' : 'success'} label={t('fnb.kitchen.tiles.out')} value={totals.out} onClick={() => setAttention('attention')} />
            <StatTile icon="trending_down" tone={totals.low ? 'warning' : 'success'} label={t('fnb.kitchen.tiles.low')} value={totals.low} onClick={() => setAttention('attention')} />
            <StatTile icon="event_busy" tone={totals.expired ? 'error' : totals.expiringSoon ? 'warning' : 'success'} label={t('fnb.kitchen.tiles.expiry')} value={totals.expired + totals.expiringSoon}
              helper={t('fnb.kitchen.tiles.expiryHint', { expired: totals.expired, soon: totals.expiringSoon })} onClick={() => setAttention('attention')} />
          </div>
        ) : (
          <Skeleton className="h-24 rounded-xl" />
        )}
      </PageHeader>

      <TableCard
        title={attention === 'attention' ? t('fnb.kitchen.needsAttention') : t('fnb.kitchen.allItems')}
        count={t('fnb.kitchen.itemCount', { count: shown.length })}
        filters={
          <FilterBar onClear={() => { setSearch(''); setCategory('all'); setAttention('all'); }} canClear={Boolean(search) || category !== 'all' || attention !== 'all'}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('fnb.kitchen.searchPlaceholder')} />
            </FilterField>
            <FilterField label={t('fnb.kitchen.category')}>
              <Select value={category} onChange={(e) => setCategory(e.target.value as KitchenCategory | 'all')}>
                <option value="all">{t('fnb.kitchen.allCategories')}</option>
                {KITCHEN_CATEGORIES.map((c) => <option key={c} value={c}>{t(`fnb.kitchen.categories.${c}`)}</option>)}
              </Select>
            </FilterField>
            <FilterField label={t('fnb.kitchen.show')}>
              <Select value={attention} onChange={(e) => setAttention(e.target.value as Attention)}>
                <option value="all">{t('fnb.kitchen.allItems')}</option>
                <option value="attention">{t('fnb.kitchen.needsAttention')}</option>
              </Select>
            </FilterField>
          </FilterBar>
        }
      >
        {query.isLoading ? (
          <TableLoading />
        ) : !shown.length ? (
          <TableEmpty
            icon="kitchen"
            title={data?.items.length ? t('fnb.kitchen.emptyFiltered') : t('fnb.kitchen.empty')}
            description={data?.items.length ? undefined : t('fnb.kitchen.emptyHint')}
            action={data?.canEdit && !data.items.length ? <Button type="button" onClick={() => setItemDialog({ item: null })}>{t('fnb.kitchen.newItem')}</Button> : undefined}
          />
        ) : (
          <DataTable minWidth={860}>
            <THead>
              <Th>{t('fnb.kitchen.columns.item')}</Th>
              <Th align="end">{t('fnb.kitchen.columns.inStock')}</Th>
              <Th>{t('fnb.kitchen.columns.status')}</Th>
              <Th>{t('fnb.kitchen.columns.expiry')}</Th>
              <Th align="end">{t('health.dashboard.columns.actions')}</Th>
            </THead>
            <TBody>
              {shown.map((item) => {
                const f = stockFlags(item, today);
                return (
                  <Tr key={item.id}>
                    <Td>
                      <span className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                          <MaterialSymbol name={CATEGORY_ICON[item.category]} size="text-lg" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-on-surface">{item.name}</span>
                          <span className="block text-xs text-on-surface-variant">{t(`fnb.kitchen.categories.${item.category}`)}</span>
                        </span>
                      </span>
                    </Td>
                    <Td align="end" className="whitespace-nowrap">
                      <span className={cn('text-base font-bold tabular-nums', f.out ? 'text-error' : f.low ? 'text-warning' : 'text-on-surface')}>{item.quantity}</span>
                      <span className="ms-1 text-xs text-on-surface-variant">{item.unit}</span>
                      {item.lowStockLevel > 0 ? <span className="block text-[11px] text-on-surface-variant">{t('fnb.kitchen.lowAt', { quantity: item.lowStockLevel })}</span> : null}
                    </Td>
                    <Td>{badges(item)}</Td>
                    <Td className={cn('whitespace-nowrap', f.expired ? 'text-error' : f.expiringSoon ? 'text-warning' : 'text-on-surface-variant')}>
                      {item.expiresOn ? formatDate(item.expiresOn) : '—'}
                    </Td>
                    <Td align="end">
                      {data?.canEdit ? (
                        <span className="inline-flex items-center">
                          <IconAction icon="add_circle" label={t('fnb.kitchen.modes.restock')} onClick={() => setMovement({ item, mode: 'restock' })} />
                          <IconAction icon="remove_circle" label={t('fnb.kitchen.modes.take')} disabled={item.quantity <= 0} onClick={() => setMovement({ item, mode: 'take' })} />
                          <IconAction icon="fact_check" label={t('fnb.kitchen.modes.count')} onClick={() => setMovement({ item, mode: 'count' })} />
                          <IconAction icon="edit" label={t('common.edit')} onClick={() => setItemDialog({ item })} />
                          <IconAction icon="delete" danger label={t('common.delete')} onClick={() => void drop(item)} />
                        </span>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      {data?.movements.length ? (
        <TableCard title={t('fnb.kitchen.history')} count={t('fnb.kitchen.historyCount', { count: data.movements.length })}>
          <ul className="divide-y divide-outline-variant" data-testid="stock-history">
            {data.movements.map((m) => {
              const look = KIND_LOOK[m.kind];
              const by = localName(m.byAr, m.byEn, isArabic);
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                  <MaterialSymbol name={look.icon} size="text-xl" className={look.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-on-surface">
                      {t(`fnb.kitchen.kinds.${m.kind}`)} · <span className="font-medium">{m.itemName}</span>{' '}
                      <span className={cn('font-semibold tabular-nums', m.change >= 0 ? 'text-success' : 'text-error')} dir="ltr">
                        {m.change >= 0 ? '+' : ''}{m.change} {m.unit}
                      </span>
                    </span>
                    <span className="block text-xs text-on-surface-variant">
                      {[t('fnb.kitchen.leftAfter', { quantity: m.quantityAfter, unit: m.unit }), by, m.note].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-on-surface-variant">{formatDateTime(m.at)}</span>
                </li>
              );
            })}
          </ul>
        </TableCard>
      ) : null}

      {itemDialog && nurseryId ? <KitchenItemDialog nurseryId={nurseryId} item={itemDialog.item} onClose={() => setItemDialog(null)} /> : null}
      {movement && nurseryId ? <StockMovementDialog nurseryId={nurseryId} item={movement.item} mode={movement.mode} onClose={() => setMovement(null)} /> : null}
    </div>
  );
}
