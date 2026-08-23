import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ActionGate } from '@/components/shared/ActionGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInventory } from '@/hooks/useInventory';
import { useSettings } from '@/lib/useSettings';

export function AdminInventoryPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const inventory = useInventory(nurseryId ?? undefined);
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<'supplies' | 'toys' | 'furniture' | 'food'>('supplies');
  const [quantity, setQuantity] = useState(0);
  const [threshold, setThreshold] = useState(5);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('inventory.adminTitle')}</h1>
      <ActionGate feature="inventory" action="create">
      <section className="grid gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:grid-cols-4">
        <Input placeholder={t('inventory.itemName')} value={itemName} onChange={(e) => setItemName(e.target.value)} />
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value as 'supplies' | 'toys' | 'furniture' | 'food')}>
          {(['supplies', 'toys', 'furniture', 'food'] as const).map((c) => <option key={c} value={c}>{t(`inventory.categories.${c}`)}</option>)}
        </select>
        <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} />
        <Input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value || 0))} />
        <Button
          className="md:col-span-4"
          onClick={() => {
            if (!nurseryId || !itemName) return;
            void inventory.saveItem({
              nursery_id: nurseryId,
              item_name: itemName,
              category,
              quantity,
              low_stock_threshold: threshold,
            }).then(() => {
              setItemName('');
              setQuantity(0);
              toast.success(t('inventory.saved'));
            });
          }}
        >
          {t('inventory.addItem')}
        </Button>
      </section>
      </ActionGate>

      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        {inventory.items.map((item) => {
          const qty = Number(item.quantity ?? 0);
          const low = Number(item.low_stock_threshold ?? item.reorder_level ?? 0);
          const lowStock = qty < low;
          return (
            <article key={String(item.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface text-foreground p-2">
              <div>
                <p className="font-medium">{String(item.item_name)}</p>
                <p className="text-xs text-on-surface-variant">{t(`inventory.categories.${String(item.category)}`)} • {t('inventory.qty')}: {qty}</p>
                {lowStock ? <p className="text-xs text-error">{t('inventory.lowStockAlert')}</p> : null}
              </div>
              <ActionGate feature="inventory" action="update">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void inventory.adjustStock({ id: String(item.id), nextQuantity: qty - 1 })}>-1</Button>
                  <Button size="sm" variant="outline" onClick={() => void inventory.adjustStock({ id: String(item.id), nextQuantity: qty + 1 })}>+1</Button>
                </div>
              </ActionGate>
            </article>
          );
        })}
      </section>
    </div>
  );
}
