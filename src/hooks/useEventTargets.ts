import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type EventClassRow = { id: string; name_ar: string; name_en: string };
export type EventChildRow = {
  id: string;
  class_id: string | null;
  full_name_ar: string;
  full_name_en: string;
  photo_privacy_restricted?: boolean;
};

interface UseEventTargetsInput {
  nurseryId: string | undefined | null;
  audienceMode: 'all' | 'specific';
  specificMode: 'classes' | 'children';
  selectedClassIds: string[];
  selectedChildIds: string[];
}

export function useEventTargets({
  nurseryId,
  audienceMode,
  specificMode,
  selectedClassIds,
  selectedChildIds,
}: UseEventTargetsInput) {
  const classesQuery = useQuery({
    queryKey: ['events-create-classes', nurseryId],
    queryFn: async (): Promise<EventClassRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventClassRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const childrenQuery = useQuery({
    queryKey: ['events-create-children', nurseryId],
    queryFn: async (): Promise<EventChildRow[]> => {
      if (!nurseryId) return [];
      const primary = await supabase
        .from('children')
        .select('id, class_id, full_name_ar, full_name_en, photo_privacy_restricted')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (!primary.error) return (primary.data ?? []) as EventChildRow[];

      const fallback = await supabase
        .from('children')
        .select('id, class_id, full_name_ar, full_name_en')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return ((fallback.data ?? []) as EventChildRow[]).map((row) => ({ ...row, photo_privacy_restricted: false }));
    },
    enabled: Boolean(nurseryId),
  });

  const children = childrenQuery.data ?? [];

  const targetChildIds = useMemo(() => {
    if (audienceMode === 'all') return children.map((child) => child.id);
    if (specificMode === 'classes') {
      return children
        .filter((child) => child.class_id && selectedClassIds.includes(child.class_id))
        .map((child) => child.id);
    }
    return selectedChildIds;
  }, [audienceMode, children, selectedChildIds, selectedClassIds, specificMode]);

  const restrictedCount = useMemo(() => {
    const idSet = new Set(targetChildIds);
    return children.filter((child) => idSet.has(child.id) && child.photo_privacy_restricted).length;
  }, [children, targetChildIds]);

  return {
    classes: classesQuery.data ?? [],
    children,
    targetChildIds,
    restrictedCount,
  };
}
