import { useQuery } from '@tanstack/react-query';

import { useNurseryChildrenPicker, type NurseryChildPickerRow } from '@/hooks/useNurseryChildrenPicker';
import { supabase } from '@/lib/supabase';

export type EventClassRow = { id: string; name_ar: string; name_en: string };
export type EventChildPickerRow = NurseryChildPickerRow;

/** What the event form picks from: the nursery's classes and children (create and edit alike). */
export function useEventFormData(nurseryId: string | null | undefined) {
  const classesQuery = useQuery({
    queryKey: ['events-create-classes', nurseryId],
    queryFn: async (): Promise<EventClassRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', nurseryId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventClassRow[];
    },
    enabled: Boolean(nurseryId),
  });
  const childrenQuery = useNurseryChildrenPicker(nurseryId);
  return {
    classes: classesQuery.data ?? [],
    classesLoading: classesQuery.isPending,
    children: childrenQuery.data ?? [],
    childrenLoading: childrenQuery.isPending,
  };
}
