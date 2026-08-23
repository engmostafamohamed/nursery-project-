import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type NurseryLanguagePref = 'ar' | 'en' | 'both';

export function useNurseryLanguagePref(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['nursery-language-pref', nurseryId],
    queryFn: async (): Promise<NurseryLanguagePref> => {
      if (!nurseryId) {
        return 'both';
      }

      const { data, error } = await supabase
        .from('nurseries')
        .select('language_pref')
        .eq('id', nurseryId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const pref = (data as { language_pref?: string } | null)?.language_pref;
      if (pref === 'ar' || pref === 'en' || pref === 'both') {
        return pref;
      }

      return 'both';
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60 * 5,
  });
}
