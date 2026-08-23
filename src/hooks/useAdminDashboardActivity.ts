import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type DashboardActivityItem =
  | { kind: 'child_check_in'; id: string; at: string; childNameEn: string; childNameAr: string }
  | { kind: 'event_created'; id: string; at: string; titleEn: string; titleAr: string };

export function useAdminDashboardActivity(nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['admin-dashboard-activity', nurseryId],
    queryFn: async (): Promise<DashboardActivityItem[]> => {
      if (!nurseryId) return [];

      const childIdsRes = await supabase.from('children').select('id').eq('nursery_id', nurseryId);
      if (childIdsRes.error) throw childIdsRes.error;
      const childIds = (childIdsRes.data ?? []).map((r: { id: string }) => r.id);

      const attPromise =
        childIds.length > 0
          ? supabase
              .from('attendance_records')
              .select(
                `
            id,
            check_in,
            child_id,
            children (
              full_name_en,
              full_name_ar
            )
          `,
              )
              .in('child_id', childIds)
              .not('check_in', 'is', null)
              .order('check_in', { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [], error: null });

      const [attRes, evRes] = await Promise.all([
        attPromise,
        supabase
          .from('events')
          .select('id, title_en, title_ar, created_at')
          .eq('nursery_id', nurseryId)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      if (attRes.error) throw attRes.error;
      if (evRes.error) throw evRes.error;

      type Ch = { full_name_en: string; full_name_ar: string };
      type AttRow = { id: string; check_in: string | null; children: Ch | Ch[] };

      const fromAtt = ((attRes.data ?? []) as AttRow[]).map((row) => {
        const ch = Array.isArray(row.children) ? row.children[0] : row.children;
        return {
          kind: 'child_check_in' as const,
          id: row.id,
          at: row.check_in ?? '',
          childNameEn: ch?.full_name_en ?? '',
          childNameAr: ch?.full_name_ar ?? '',
        };
      });

      type EvRow = { id: string; title_en: string; title_ar: string; created_at: string };

      const fromEv = ((evRes.data ?? []) as EvRow[]).map((row) => ({
        kind: 'event_created' as const,
        id: row.id,
        at: row.created_at,
        titleEn: row.title_en,
        titleAr: row.title_ar,
      }));

      const merged = [...fromAtt, ...fromEv].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

      return merged.slice(0, 5);
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60,
  });
}
