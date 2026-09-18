import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentNursery = {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string | null;
};

type NurseryNameRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  city: string | null;
};

const NURSERY_NAME_COLUMNS = 'id, name_en, name_ar, city';

function toParentNursery(row: NurseryNameRow): ParentNursery {
  return {
    id: row.id,
    nameEn: row.name_en?.trim() ?? '',
    nameAr: row.name_ar?.trim() ?? '',
    city: row.city?.trim() || null,
  };
}

/** Display name in the current language, e.g. "Cherries — Cairo". */
export function parentNurseryLabel(nursery: ParentNursery | null | undefined, language: string): string {
  if (!nursery) return '';
  const name = language.startsWith('ar') ? nursery.nameAr || nursery.nameEn : nursery.nameEn || nursery.nameAr;
  if (!name) return '';
  return nursery.city ? `${name} — ${nursery.city}` : name;
}

/**
 * Name of the nursery a parent is registered in. Reads the public signup view first
 * (every signed-in user can read it), then the nurseries table for nurseries the view
 * hides (inactive subscription) but the parent can still see through RLS.
 */
export function useParentNursery(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['parent-nursery', nurseryId],
    queryFn: async (): Promise<ParentNursery | null> => {
      if (!nurseryId) return null;

      const fromView = await supabase
        .from('signup_nursery_options')
        .select(NURSERY_NAME_COLUMNS)
        .eq('id', nurseryId)
        .maybeSingle();
      if (fromView.data) return toParentNursery(fromView.data as NurseryNameRow);

      const fromTable = await supabase
        .from('nurseries')
        .select(NURSERY_NAME_COLUMNS)
        .eq('id', nurseryId)
        .maybeSingle();
      if (fromTable.error) throw fromTable.error;
      return fromTable.data ? toParentNursery(fromTable.data as NurseryNameRow) : null;
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60 * 5,
  });
}
