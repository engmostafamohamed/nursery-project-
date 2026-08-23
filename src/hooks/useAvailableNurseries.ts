import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/enums';

export type AvailableNursery = {
  id: string;
  name_ar: string;
  name_en: string;
};

/**
 * Returns the list of nurseries the current admin can manage.
 * - xo_super_admin: all nurseries
 * - chain_super_admin: nurseries in their chain
 * - branch_admin (or other roles): just their own nursery (if any)
 */
export function useAvailableNurseries(params: {
  role: UserRole | null | undefined;
  chainId: string | null | undefined;
  nurseryId: string | null | undefined;
}) {
  const { role, chainId, nurseryId } = params;
  return useQuery({
    queryKey: ['available-nurseries', role ?? null, chainId ?? null, nurseryId ?? null],
    enabled: Boolean(role),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AvailableNursery[]> => {
      if (role === 'xo_super_admin') {
        const { data, error } = await supabase
          .from('nurseries')
          .select('id, name_ar, name_en')
          .order('name_en', { ascending: true });
        if (error) throw error;
        return (data ?? []) as AvailableNursery[];
      }
      if (role === 'chain_super_admin') {
        if (!chainId) return [];
        const { data, error } = await supabase
          .from('nurseries')
          .select('id, name_ar, name_en')
          .eq('chain_id', chainId)
          .order('name_en', { ascending: true });
        if (error) throw error;
        return (data ?? []) as AvailableNursery[];
      }
      // branch_admin and other single-nursery roles
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('nurseries')
        .select('id, name_ar, name_en')
        .eq('id', nurseryId)
        .maybeSingle();
      if (error) throw error;
      return data ? [data as AvailableNursery] : [];
    },
  });
}
