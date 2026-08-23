import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useMealPlans(nurseryId?: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['meal-plans', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];
      const res = await supabase
        .from('meal_plans')
        .select('*')
        .eq('nursery_id', nurseryId)
        .order('week_start_date', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(nurseryId),
  });

  const savePlan = useMutation({
    mutationFn: async (payload: { nursery_id: string; week_start_date: string; meals_json: Record<string, unknown> }) => {
      const res = await supabase.from('meal_plans').upsert(payload as never, { onConflict: 'nursery_id,week_start_date' });
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meal-plans'] }),
  });

  return {
    plans: query.data ?? [],
    isLoading: query.isLoading,
    savePlan: savePlan.mutateAsync,
  };
}
