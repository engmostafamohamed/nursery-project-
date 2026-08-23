import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useInventory(nurseryId?: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['inventory', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];
      const res = await supabase.from('inventory').select('*').eq('nursery_id', nurseryId).order('item_name', { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(nurseryId),
  });

  const upsertItem = useMutation({
    mutationFn: async (payload: {
      id?: string;
      nursery_id: string;
      item_name: string;
      category: 'supplies' | 'toys' | 'furniture' | 'food';
      quantity: number;
      low_stock_threshold: number;
    }) => {
      if (payload.id) {
        const res = await supabase.from('inventory').update({
          item_name: payload.item_name,
          category: payload.category,
          quantity: String(payload.quantity),
          low_stock_threshold: String(payload.low_stock_threshold),
        } as never).eq('id', payload.id);
        if (res.error) throw res.error;
        return;
      }
      const res = await supabase.from('inventory').insert({
        nursery_id: payload.nursery_id,
        item_name: payload.item_name,
        category: payload.category,
        quantity: String(payload.quantity),
        unit: 'pcs',
        low_stock_threshold: String(payload.low_stock_threshold),
      } as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const adjustStock = useMutation({
    mutationFn: async (payload: { id: string; nextQuantity: number }) => {
      const res = await supabase.from('inventory').update({ quantity: String(payload.nextQuantity) } as never).eq('id', payload.id);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    saveItem: upsertItem.mutateAsync,
    adjustStock: adjustStock.mutateAsync,
  };
}
