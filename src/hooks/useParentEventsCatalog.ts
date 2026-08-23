import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const parentEventsCatalogQueryKey = (parentId: string | undefined, profileNurseryId: string | null | undefined) =>
  ['parent-events-catalog', parentId, profileNurseryId ?? ''] as const;

export type ParentCatalogEventRow = {
  id: string;
  parent_created_by?: string | null;
  title_ar: string;
  title_en: string;
  starts_at: string;
  location: string | null;
  category: string;
  is_urgent: boolean;
  urgent_days_of_week: number[];
  urgent_hours_of_day: number[];
  urgent_repeats_weekly: boolean;
  status: string;
  is_paid: boolean;
  price: string | null;
  permission_deadline: string | null;
};

export type ParentCatalogPermissionRow = {
  event_id: string;
  child_id: string;
  status: string;
  child_name_ar: string;
  child_name_en: string;
};

async function resolveNurseryId(parentId: string, profileNurseryId: string | null | undefined): Promise<string | null> {
  if (profileNurseryId) return profileNurseryId;
  const res = await supabase
    .from('parent_children')
    .select('children (nursery_id)')
    .eq('parent_id', parentId)
    .limit(1)
    .maybeSingle();
  if (res.error) throw res.error;
  const raw = res.data as { children: { nursery_id: string } | { nursery_id: string }[] | null } | null;
  const ch = raw?.children;
  const one = Array.isArray(ch) ? ch[0] : ch;
  return one?.nursery_id ?? null;
}

export function useParentEventsCatalog(parentId: string | undefined, profileNurseryId: string | null | undefined) {
  return useQuery({
    queryKey: parentEventsCatalogQueryKey(parentId, profileNurseryId),
    queryFn: async (): Promise<{
      nurseryId: string | null;
      events: ParentCatalogEventRow[];
      permissions: ParentCatalogPermissionRow[];
    }> => {
      if (!parentId) return { nurseryId: null, events: [], permissions: [] };
      const nurseryId = await resolveNurseryId(parentId, profileNurseryId);
      if (!nurseryId) return { nurseryId: null, events: [], permissions: [] };

      const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', parentId);
      if (linksRes.error) throw linksRes.error;
      const childIds = ((linksRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
      if (!childIds.length) {
        return { nurseryId, events: [], permissions: [] };
      }

      const permRes = await supabase
        .from('permissions')
        .select(
          `
          event_id, child_id, status,
          children (full_name_ar, full_name_en)
        `,
        )
        .in('child_id', childIds)
        .not('event_id', 'is', null);
      if (permRes.error) throw permRes.error;

      type RawP = {
        event_id: string | null;
        child_id: string;
        status: string;
        children: { full_name_ar: string; full_name_en: string } | { full_name_ar: string; full_name_en: string }[] | null;
      };

      const permissions: ParentCatalogPermissionRow[] = ((permRes.data ?? []) as RawP[])
        .filter((p) => p.event_id)
        .map((p) => {
          const ch = p.children;
          const one = Array.isArray(ch) ? ch[0] : ch;
          return {
            event_id: p.event_id as string,
            child_id: p.child_id,
            status: p.status,
            child_name_ar: one?.full_name_ar ?? '',
            child_name_en: one?.full_name_en ?? '',
          };
        });

      const eventIds = [...new Set(permissions.map((p) => p.event_id))];
      const eventSelect =
        'id, parent_created_by, title_ar, title_en, starts_at, location, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, status, is_paid, price, permission_deadline';
      const eventsById = new Map<string, ParentCatalogEventRow>();

      if (eventIds.length) {
        const evRes = await supabase
          .from('events')
          .select(eventSelect)
          .eq('nursery_id', nurseryId)
          .eq('status', 'active')
          .is('cancelled_at', null)
          .in('id', eventIds)
          .order('starts_at', { ascending: false });
        if (evRes.error) throw evRes.error;
        for (const event of (evRes.data ?? []) as ParentCatalogEventRow[]) {
          eventsById.set(event.id, event);
        }
      }

      const ownEventRes = await supabase
        .from('events')
        .select(eventSelect)
        .eq('nursery_id', nurseryId)
        .eq('status', 'active')
        .is('cancelled_at', null)
        .eq('parent_created_by', parentId)
        .order('starts_at', { ascending: false });
      if (ownEventRes.error) throw ownEventRes.error;
      for (const event of (ownEventRes.data ?? []) as ParentCatalogEventRow[]) {
        eventsById.set(event.id, event);
      }

      const events = [...eventsById.values()].sort(
        (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
      );
      const allowed = new Set(events.map((e) => e.id));
      const permissionsFiltered = permissions.filter((p) => allowed.has(p.event_id));

      return { nurseryId, events, permissions: permissionsFiltered };
    },
    enabled: Boolean(parentId),
  });
}
