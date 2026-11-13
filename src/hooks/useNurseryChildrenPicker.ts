import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/** A child to pick by name (the nursery's active children). */
export type NurseryChildPickerRow = { id: string; full_name_ar: string; full_name_en: string };

export const nurseryChildrenPickerQueryKey = (nurseryId: string | null | undefined) =>
  ['nursery-children-picker', nurseryId ?? ''] as const;

export function useNurseryChildrenPicker(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: nurseryChildrenPickerQueryKey(nurseryId),
    queryFn: async (): Promise<NurseryChildPickerRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en')
        .eq('nursery_id', nurseryId)
        .eq('status', 'active')
        .order('full_name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as NurseryChildPickerRow[];
    },
    enabled: Boolean(nurseryId),
  });
}
