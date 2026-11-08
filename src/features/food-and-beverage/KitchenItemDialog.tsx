import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { COMMON_UNITS, itemIssues, KITCHEN_CATEGORIES, type ItemDraft, type KitchenCategory, type KitchenItem } from './kitchen';
import { fnbErrorKey, saveKitchenItem } from './mealPlansApi';
import { useKitchenChange } from './useMealPlansAndKitchen';

/** Adding a kitchen item (it starts at 0; restock it after) or changing its details. */
export function KitchenItemDialog({ nurseryId, item, onClose }: { nurseryId: string; item: KitchenItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ItemDraft>(() =>
    item
      ? { name: item.name, category: item.category, unit: item.unit, lowStockLevel: String(item.lowStockLevel), expiresOn: item.expiresOn ?? '' }
      : { name: '', category: 'food', unit: 'kg', lowStockLevel: '1', expiresOn: '' },
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const issues = itemIssues(draft);
  const save = useKitchenChange(nurseryId, () =>
    saveKitchenItem({ nurseryId, id: item?.id ?? null, name: draft.name, category: draft.category, unit: draft.unit, lowStockLevel: Number(draft.lowStockLevel), expiresOn: draft.expiresOn || null }),
  );
  const shown = (field: keyof typeof issues) => (tried || touched[field]) && issues[field];
  const set = (patch: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const blur = (field: string) => () => setTouched((s) => ({ ...s, [field]: true }));
  const error = (field: keyof typeof issues) =>
    shown(field) ? <p id={`kitchen-${field}-error`} role="alert" className="text-xs text-error">{t(`fnb.kitchen.issues.${issues[field]}`)}</p> : null;

  const submit = async () => {
    setTried(true);
    if (Object.keys(issues).length) return;
    try {
      await save.mutateAsync(undefined);
      toast.success(t('fnb.kitchen.itemSaved'));
      onClose();
    } catch (e) {
      toast.error(t(fnbErrorKey(e)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? t('fnb.kitchen.editItem') : t('fnb.kitchen.newItem')}</DialogTitle>
          <DialogDescription>{item ? t('fnb.kitchen.editItemHint') : t('fnb.kitchen.newItemHint')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="space-y-1">
            <Label htmlFor="kitchen-name">{t('fnb.kitchen.name')}</Label>
            <Input id="kitchen-name" autoFocus value={draft.name} placeholder={t('fnb.kitchen.namePlaceholder')} aria-invalid={Boolean(shown('name'))}
              className={cn(shown('name') && 'border-error')} onChange={(e) => set({ name: e.target.value })} onBlur={blur('name')} />
            {error('name')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="kitchen-category">{t('fnb.kitchen.category')}</Label>
              <Select id="kitchen-category" value={draft.category} onChange={(e) => set({ category: e.target.value as KitchenCategory })}>
                {KITCHEN_CATEGORIES.map((c) => <option key={c} value={c}>{t(`fnb.kitchen.categories.${c}`)}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="kitchen-unit">{t('fnb.kitchen.unit')}</Label>
              <Input id="kitchen-unit" list="kitchen-units" value={draft.unit} aria-invalid={Boolean(shown('unit'))}
                className={cn(shown('unit') && 'border-error')} onChange={(e) => set({ unit: e.target.value })} onBlur={blur('unit')} />
              <datalist id="kitchen-units">{COMMON_UNITS.map((u) => <option key={u} value={t(`fnb.kitchen.units.${u}`)} />)}</datalist>
              {error('unit')}
            </div>
            <div className="space-y-1">
              <Label htmlFor="kitchen-low">{t('fnb.kitchen.lowLevel')}</Label>
              <Input id="kitchen-low" inputMode="decimal" value={draft.lowStockLevel} aria-invalid={Boolean(shown('lowStockLevel'))}
                className={cn(shown('lowStockLevel') && 'border-error')} onChange={(e) => set({ lowStockLevel: e.target.value.replace(/[^\d.]/g, '') })} onBlur={blur('lowStockLevel')} />
              {error('lowStockLevel') ?? <p className="text-xs text-on-surface-variant">{t('fnb.kitchen.lowLevelHint')}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="kitchen-expiry">{t('fnb.kitchen.expiry')}</Label>
              <Input id="kitchen-expiry" type="date" value={draft.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
              <p className="text-xs text-on-surface-variant">{t('fnb.kitchen.optional')}</p>
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>{save.isPending ? t('fnb.editor.saving') : t('fnb.kitchen.saveItem')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
