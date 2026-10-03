import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const adminDealsKey = (nurseryId: string | null | undefined) => ['admin-deals', nurseryId] as const;

export type DealDiscountType = 'percentage' | 'fixed_amount';

export type DealRow = {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  discount_type: DealDiscountType;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  /** Packages (tuition + extra-hours) currently assigned to this deal. */
  assigned_count: number;
};

export type DealInput = {
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  discount_type: DealDiscountType;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
};

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Whether a deal is currently claimable: active and inside its optional start/end window. */
export function isDealCurrentlyActive(deal: Pick<DealRow, 'active' | 'starts_at' | 'ends_at'>): boolean {
  if (!deal.active) return false;
  const now = Date.now();
  if (deal.starts_at && new Date(deal.starts_at).getTime() > now) return false;
  if (deal.ends_at && new Date(deal.ends_at).getTime() <= now) return false;
  return true;
}

export function useAdminDeals(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = adminDealsKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<DealRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('deals')
        .select('id, nursery_id, name_ar, name_en, description_ar, description_en, discount_type, discount_value, starts_at, ends_at, active, created_at')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const ids = rows.map((row) => row.id as string);

      const countMap = new Map<string, number>();
      if (ids.length) {
        const [tuitionRes, hoursRes] = await Promise.all([
          supabase.from('tuition_packages').select('deal_id').in('deal_id', ids),
          supabase.from('packages').select('deal_id').in('deal_id', ids),
        ]);
        for (const row of [...(tuitionRes.data ?? []), ...(hoursRes.data ?? [])] as { deal_id: string | null }[]) {
          if (!row.deal_id) continue;
          countMap.set(row.deal_id, (countMap.get(row.deal_id) ?? 0) + 1);
        }
      }

      return rows.map((row) => ({
        ...(row as Omit<DealRow, 'discount_value' | 'assigned_count'>),
        discount_value: money(row.discount_value),
        assigned_count: countMap.get(row.id as string) ?? 0,
      })) as DealRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const create = useMutation({
    mutationFn: async (input: DealInput): Promise<string> => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { data, error } = await supabase
        .from('deals')
        .insert({ ...input, nursery_id: nurseryId } as never)
        .select('id')
        .single();
      if (error) throw error;
      return String((data as { id: string }).id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: DealInput }) => {
      const { error } = await supabase.from('deals').update(input as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('deals').update({ active } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { query, create, update, toggleActive };
}
