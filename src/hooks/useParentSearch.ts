import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentSearchResult = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  email: string | null;
  phone: string | null;
};

/** PostgREST `or=` splits on commas, so a comma in the term would corrupt the filter. */
function sanitizeTerm(term: string): string {
  return term.trim().replace(/[,()*]/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Existing parents of a nursery, searched by name / email / phone, so an admin can
 * attach a new child to the account a family already has instead of retyping their
 * details and risking a duplicate.
 */
export function useParentSearch(nurseryId: string | undefined, term: string) {
  const cleaned = sanitizeTerm(term);

  return useQuery({
    queryKey: ['parent-search', nurseryId, cleaned],
    enabled: Boolean(nurseryId) && cleaned.length >= 2,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<ParentSearchResult[]> => {
      const like = `*${cleaned}*`;
      const { data, error } = await supabase
        .from('users')
        .select('id, name_ar, name_en, email, phone')
        .eq('role', 'parent')
        .eq('nursery_id', nurseryId!)
        .or(`name_en.ilike.${like},name_ar.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .order('name_en')
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ParentSearchResult[];
    },
  });
}

export function parentDisplayName(parent: ParentSearchResult, preferArabic: boolean): string {
  const ar = parent.name_ar?.trim() ?? '';
  const en = parent.name_en?.trim() ?? '';
  return (preferArabic ? ar || en : en || ar) || parent.email || '';
}

/**
 * The picker only ever finds parents of the admin's own nursery, so the empty state
 * has to name it — otherwise searching a parent who belongs to another nursery looks
 * like the account does not exist at all.
 */
export function useNurseryName(nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['nursery-name', nurseryId],
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('nurseries')
        .select('name_en, name_ar')
        .eq('id', nurseryId!)
        .maybeSingle();
      if (error) throw error;
      const row = data as { name_en: string | null; name_ar: string | null } | null;
      return row?.name_en?.trim() || row?.name_ar?.trim() || '';
    },
  });
}
