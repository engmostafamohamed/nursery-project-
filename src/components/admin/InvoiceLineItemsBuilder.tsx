import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type BuilderLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

interface Props {
  items: BuilderLineItem[];
  onChange: (items: BuilderLineItem[]) => void;
}

export function InvoiceLineItemsBuilder({ items, onChange }: Props) {
  const { t } = useTranslation();

  const updateItem = (idx: number, key: keyof BuilderLineItem, value: string | number) => {
    const next = [...items];
    next[idx] = { ...next[idx], [key]: value };
    onChange(next);
  };

  const addItem = () => {
    onChange([...items, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t('invoice.create.lineItems')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          {t('invoice.create.addLineItem')}
        </Button>
      </div>
      {items.map((item, idx) => {
        const total = item.quantity * item.unitPrice;
        return (
          <div key={`${idx}-${item.description}`} className="grid gap-2 rounded-xl border border-outline-variant p-3 md:grid-cols-[1fr_120px_120px_100px_40px]">
            <Input
              placeholder={t('invoice.create.description')}
              value={item.description}
              onChange={(e) => updateItem(idx, 'description', e.target.value)}
            />
            <Input
              type="number"
              min="1"
              value={item.quantity}
              onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={item.unitPrice}
              onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
            />
            <Input value={total.toFixed(2)} readOnly />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} aria-label={t('invoice.create.removeLineItem')}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
