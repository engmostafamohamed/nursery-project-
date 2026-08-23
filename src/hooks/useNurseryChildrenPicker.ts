import { useQuery } from '@tanstack/react-query';

import type { EventChildPickerRow } from '@/components/admin/EventFormFields';
import { supabase } from '@/lib/supabase';

export const nurseryChildrenPickerQueryKey = (nurseryId: string | null | undefined) =>
  ['nursery-children-picker', nurseryId ?? ''] as const;

export function useNurseryChildrenPicker(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: nurseryChildrenPickerQueryKey(nurseryId),
    queryFn: async (): Promise<EventChildPickerRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en')
        .eq('nursery_id', nurseryId)
        .eq('status', 'active')
        .order('full_name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventChildPickerRow[];
    },
    enabled: Boolean(nurseryId),
  });
}
