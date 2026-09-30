import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const tuitionPackagesKey = (nurseryId: string | null | undefined) =>
  ['admin-tuition-packages', nurseryId] as const;

export type TuitionFeature = { ar: string; en: string };

export type TuitionPackageRow = {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  daily_hours: number | null;
  features_json: TuitionFeature[];
  price: number;
  active: boolean;
  created_at: string;
};

export type TuitionPackageInput = {
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  daily_hours: number | null;
  features_json: TuitionFeature[];
  price: number;
  active: boolean;
};

function normalizeFeatures(value: unknown): TuitionFeature[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({ ar: String(item.ar ?? ''), en: String(item.en ?? '') }))
    .filter((item) => item.ar || item.en);
}

export function useAdminTuitionPackages(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = tuitionPackagesKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TuitionPackageRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('tuition_packages')
        .select('id, nursery_id, name_ar, name_en, description_ar, description_en, daily_hours, features_json, price, active, created_at')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as Omit<TuitionPackageRow, 'features_json'>),
        features_json: normalizeFeatures(row.features_json),
      })) as TuitionPackageRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const create = useMutation({
    mutationFn: async (input: TuitionPackageInput) => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { error } = await supabase
        .from('tuition_packages')
        .insert({ ...input, nursery_id: nurseryId } as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TuitionPackageInput }) => {
      const { error } = await supabase.from('tuition_packages').update(input as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tuition_packages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  useEffect(() => {
    if (!nurseryId) return;
    const channel = supabase
      .channel(`admin-tuition-packages-${nurseryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tuition_packages' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nurseryId, queryClient, key]);

  return { query, create, update, remove };
}
