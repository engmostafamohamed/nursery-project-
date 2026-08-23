import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useContentLibrary(nurseryId?: string, category?: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['content-library', nurseryId, category],
    queryFn: async () => {
      if (!nurseryId) return [];
      let q = supabase
        .from('content_library')
        .select('*')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (category && category !== 'all') q = q.eq('category', category);
      const res = await q;
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(nurseryId),
  });

  const saveItem = useMutation({
    mutationFn: async (payload: {
      id?: string;
      nursery_id: string;
      title: string;
      category: 'parenting_tips' | 'activities' | 'recipes' | 'health';
      content: string;
      media_url?: string;
    }) => {
      if (payload.id) {
        const res = await supabase.from('content_library').update(payload as never).eq('id', payload.id);
        if (res.error) throw res.error;
        return;
      }
      const res = await supabase.from('content_library').insert(payload as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['content-library'] }),
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    saveItem: saveItem.mutateAsync,
  };
}
