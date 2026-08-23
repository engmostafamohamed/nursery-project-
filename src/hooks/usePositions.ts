import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export interface PositionRow {
  id: string;
  nursery_id: string | null;
  key: string;
  name_en: string;
  name_ar: string;
  role_id: string;
  is_seed: boolean;
  created_at: string;
  updated_at: string;
}

export interface PositionWithRoleRow extends PositionRow {
  role: {
    id: string;
    key: string;
    name_en: string;
    name_ar: string;
    base_role: string;
    base_department: string | null;
  } | null;
}

export function usePositions() {
  return useQuery<PositionWithRoleRow[]>({
    queryKey: ['rbac', 'positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select(
          'id, nursery_id, key, name_en, name_ar, role_id, is_seed, created_at, updated_at, role:roles(id, key, name_en, name_ar, base_role, base_department)',
        )
        .order('is_seed', { ascending: false })
        .order('name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PositionWithRoleRow[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export interface CreatePositionInput {
  key: string;
  name_en: string;
  name_ar: string;
  role_id: string;
  nursery_id: string | null;
}

export function useCreatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePositionInput) => {
      const { data, error } = await supabase
        .from('positions')
        .insert({ ...input, is_seed: false })
        .select()
        .single();
      if (error) throw error;
      return data as PositionRow;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'positions'] });
    },
  });
}

export function useDeletePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (positionId: string) => {
      const { error } = await supabase.from('positions').delete().eq('id', positionId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'positions'] });
    },
  });
}
