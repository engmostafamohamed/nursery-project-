import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { NurserySettingsRow } from '@/types/tables/nursery_settings';

const queryKeyFor = (nurseryId: string | null | undefined) => ['nursery-settings', nurseryId];

export function useNurserySettings(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeyFor(nurseryId),
    queryFn: async (): Promise<NurserySettingsRow | null> => {
      if (!nurseryId) return null;
      const { data, error } = await supabase
        .from('nursery_settings')
        .select('*')
        .eq('nursery_id', nurseryId)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as NurserySettingsRow;

      const createRes = await supabase
        .from('nursery_settings')
        .insert({ nursery_id: nurseryId } as never)
        .select('*')
        .single();
      if (createRes.error) throw createRes.error;
      return createRes.data as NurserySettingsRow;
    },
    enabled: Boolean(nurseryId),
  });

  const mutation = useMutation({
    mutationFn: async (partial: Partial<NurserySettingsRow>) => {
      if (!nurseryId) throw new Error('Missing nursery id');
      const { data, error } = await supabase
        .from('nursery_settings')
        .update(partial as never)
        .eq('nursery_id', nurseryId)
        .select('*')
        .single();
      if (error) throw error;
      return data as NurserySettingsRow;
    },
    onMutate: async (partial) => {
      const key = queryKeyFor(nurseryId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NurserySettingsRow | null>(key);
      if (previous) {
        queryClient.setQueryData<NurserySettingsRow | null>(key, { ...previous, ...partial });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeyFor(nurseryId), context.previous);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeyFor(nurseryId) });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    updateSettings: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
