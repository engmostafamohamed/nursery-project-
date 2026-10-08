import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Action } from '@/lib/permissions/types';

/** One module in the permission catalogue. Labels live in the locale files (rbac.features.<id>). */
export interface FeatureRow {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  category: string | null;
  description_en: string | null;
  description_ar: string | null;
  /** The actions this module supports — the only ones a role can be given on it. */
  actions: Action[];
  sort_order: number;
  is_seed: boolean;
  created_at: string;
  updated_at: string;
}

export function useFeatures() {
  return useQuery<FeatureRow[]>({
    queryKey: ['rbac', 'features'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('features')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeatureRow[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export interface CreateFeatureInput {
  id: string;
  name_en: string;
  name_ar: string;
  category: string | null;
}

export function useCreateFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFeatureInput) => {
      const { data, error } = await supabase
        .from('features')
        .insert({ ...input, is_seed: false })
        .select()
        .single();
      if (error) throw error;
      return data as FeatureRow;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'features'] });
    },
  });
}

export function useDeleteFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (featureId: string) => {
      const { error } = await supabase.from('features').delete().eq('id', featureId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'features'] });
    },
  });
}
