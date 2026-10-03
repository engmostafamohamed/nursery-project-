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
  deal_id: string | null;
  /** Children currently on an active child_tuition_subscriptions row for this package. */
  subscribed_count: number;
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
  deal_id: string | null;
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
        .select('id, nursery_id, name_ar, name_en, description_ar, description_en, daily_hours, features_json, price, active, created_at, deal_id')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const ids = rows.map((row) => row.id as string);

      const countMap = new Map<string, number>();
      if (ids.length) {
        const { data: subs } = await supabase
          .from('child_tuition_subscriptions')
          .select('tuition_package_id')
          .eq('status', 'active')
          .in('tuition_package_id', ids);
        for (const row of (subs ?? []) as { tuition_package_id: string | null }[]) {
          if (!row.tuition_package_id) continue;
          countMap.set(row.tuition_package_id, (countMap.get(row.tuition_package_id) ?? 0) + 1);
        }
      }

      return rows.map((row) => ({
        ...(row as Omit<TuitionPackageRow, 'features_json' | 'subscribed_count'>),
        features_json: normalizeFeatures(row.features_json),
        subscribed_count: countMap.get(row.id as string) ?? 0,
      })) as TuitionPackageRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const create = useMutation({
    mutationFn: async (input: TuitionPackageInput): Promise<string> => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { data, error } = await supabase
        .from('tuition_packages')
        .insert({ ...input, nursery_id: nurseryId } as never)
        .select('id')
        .single();
      if (error) throw error;
      return String((data as { id: string }).id);
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

  useEffect(() => {
    if (!nurseryId) return;
    const channel = supabase
      .channel(`admin-tuition-packages-${nurseryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tuition_packages' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_tuition_subscriptions' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nurseryId, queryClient, key]);

  return { query, create, update };
}
