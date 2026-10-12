import { useQuery } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export type ChildOption = {
  id: string;
  nameAr: string;
  nameEn: string;
};

export function useParentChildren() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;

  const query = useQuery({
    queryKey: ['parent-children-list', user?.id, nurseryId],
    queryFn: async () => {
      if (!user?.id || !nurseryId) return [] as ChildOption[];
      const links = await supabase.from('parent_children').select('child_id').eq('parent_id', user.id);
      if (links.error) throw links.error;
      const ids = [...new Set(((links.data ?? []) as { child_id: string }[]).map((r) => r.child_id))];
      if (!ids.length) return [] as ChildOption[];
      const { data, error } = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en')
        .in('id', ids)
        .eq('nursery_id', nurseryId)
        .eq('status', 'active');
      if (error) throw error;
      return ((data ?? []) as { id: string; full_name_ar: string; full_name_en: string }[]).map((c) => ({
        id: c.id,
        nameAr: c.full_name_ar,
        nameEn: c.full_name_en,
      }));
    },
    enabled: Boolean(user?.id && nurseryId),
  });

  return query;
}
