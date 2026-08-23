import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentPermissionTab = 'pending' | 'granted' | 'denied';

export type ParentPermissionCard = {
  id: string;
  child_id: string;
  event_id: string;
  status: string;
  parent_note: string | null;
  responded_at: string | null;
  deadline: string | null;
  childNameAr: string;
  childNameEn: string;
  avatar_url: string | null;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  starts_at: string;
  location: string | null;
  category: string;
  is_paid: boolean;
  price: string | null;
  event_permission_deadline: string | null;
};

type RawPermissionRow = {
  id: string;
  child_id: string;
  event_id: string | null;
  status: string;
  parent_note: string | null;
  responded_at: string | null;
  deadline: string | null;
  children: {
    full_name_ar: string;
    full_name_en: string;
    avatar_url: string | null;
  } | null;
  events: {
    title_ar: string;
    title_en: string;
    description_ar: string | null;
    description_en: string | null;
    starts_at: string;
    location: string | null;
    category: string;
    is_paid: boolean;
    price: string | null;
    permission_deadline: string | null;
  } | null;
};

function mapRow(row: RawPermissionRow): ParentPermissionCard | null {
  if (!row.event_id || !row.children || !row.events) return null;
  return {
    id: row.id,
    child_id: row.child_id,
    event_id: row.event_id,
    status: row.status,
    parent_note: row.parent_note,
    responded_at: row.responded_at,
    deadline: row.deadline,
    childNameAr: row.children.full_name_ar,
    childNameEn: row.children.full_name_en,
    avatar_url: row.children.avatar_url,
    title_ar: row.events.title_ar,
    title_en: row.events.title_en,
    description_ar: row.events.description_ar,
    description_en: row.events.description_en,
    starts_at: row.events.starts_at,
    location: row.events.location,
    category: row.events.category,
    is_paid: row.events.is_paid,
    price: row.events.price,
    event_permission_deadline: row.events.permission_deadline,
  };
}

async function fetchChildIds(parentId: string): Promise<string[]> {
  const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', parentId);
  if (linksRes.error) throw linksRes.error;
  return ((linksRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
}

export const parentPermissionsPageQueryKey = (parentId: string | undefined, tab: ParentPermissionTab) =>
  ['parent-permissions-page', parentId, tab] as const;

export const parentPermissionsCountsQueryKey = (parentId: string | undefined) =>
  ['parent-permissions-counts', parentId] as const;

export function useParentPermissionCounts(parentId: string | undefined) {
  return useQuery({
    queryKey: parentPermissionsCountsQueryKey(parentId),
    queryFn: async (): Promise<{ pending: number; granted: number; denied: number }> => {
      if (!parentId) return { pending: 0, granted: 0, denied: 0 };
      const childIds = await fetchChildIds(parentId);
      if (!childIds.length) return { pending: 0, granted: 0, denied: 0 };

      const { data, error } = await supabase
        .from('permissions')
        .select('status')
        .in('child_id', childIds)
        .not('event_id', 'is', null);
      if (error) throw error;

      const counts = { pending: 0, granted: 0, denied: 0 };
      for (const row of (data ?? []) as { status: string }[]) {
        if (row.status === 'pending') counts.pending += 1;
        else if (row.status === 'granted') counts.granted += 1;
        else if (row.status === 'denied') counts.denied += 1;
      }
      return counts;
    },
    enabled: Boolean(parentId),
  });
}

export function useParentPermissionCards(parentId: string | undefined, tab: ParentPermissionTab) {
  return useQuery({
    queryKey: parentPermissionsPageQueryKey(parentId, tab),
    queryFn: async (): Promise<ParentPermissionCard[]> => {
      if (!parentId) return [];
      const childIds = await fetchChildIds(parentId);
      if (!childIds.length) return [];

      const { data, error } = await supabase
        .from('permissions')
        .select(
          `
          id,
          child_id,
          event_id,
          status,
          parent_note,
          responded_at,
          deadline,
          children (full_name_ar, full_name_en, avatar_url),
          events (title_ar, title_en, description_ar, description_en, starts_at, location, category, is_paid, price, permission_deadline)
        `,
        )
        .in('child_id', childIds)
        .not('event_id', 'is', null)
        .eq('status', tab);

      if (error) throw error;

      const rows = (data ?? []) as RawPermissionRow[];
      const cards = rows.map(mapRow).filter((c): c is ParentPermissionCard => c !== null);
      cards.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      return cards;
    },
    enabled: Boolean(parentId),
  });
}
