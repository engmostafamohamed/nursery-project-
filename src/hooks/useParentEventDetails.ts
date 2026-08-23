import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const parentEventDetailsQueryKey = (eventId: string | undefined, parentId: string | undefined) =>
  ['parent-event-details', eventId, parentId] as const;

export type ParentEventDetailsEvent = {
  id: string;
  nursery_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  category: string;
  is_urgent: boolean;
  urgent_days_of_week: number[];
  urgent_hours_of_day: number[];
  urgent_repeats_weekly: boolean;
  is_paid: boolean;
  price: string | null;
  target_scope: string;
  target_class_id: string | null;
  status: string;
  cancelled_at: string | null;
  permission_deadline: string | null;
  classNameAr: string | null;
  classNameEn: string | null;
};

export type ParentEventDetailsPermission = {
  id: string;
  child_id: string;
  status: string;
  parent_note: string | null;
  responded_at: string | null;
  deadline: string | null;
  childNameAr: string;
  childNameEn: string;
  avatar_url: string | null;
  invoice: { id: string; amount: string; status: string } | null;
};

export type ParentEventDetailsData = {
  event: ParentEventDetailsEvent;
  permissions: ParentEventDetailsPermission[];
};

async function fetchChildIds(parentId: string): Promise<string[]> {
  const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', parentId);
  if (linksRes.error) throw linksRes.error;
  return ((linksRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
}

function normalizeClassEmbed(raw: {
  classes?: { name_ar: string; name_en: string } | { name_ar: string; name_en: string }[] | null;
}): { classNameAr: string | null; classNameEn: string | null } {
  const cls = raw.classes;
  const one = Array.isArray(cls) ? cls[0] : cls;
  return { classNameAr: one?.name_ar ?? null, classNameEn: one?.name_en ?? null };
}

export function useParentEventDetails(eventId: string | undefined, parentId: string | undefined) {
  return useQuery({
    queryKey: parentEventDetailsQueryKey(eventId, parentId),
    queryFn: async (): Promise<ParentEventDetailsData | null> => {
      if (!eventId || !parentId) return null;

      const childIds = await fetchChildIds(parentId);

      const eventRes = await supabase
        .from('events')
        .select(
          `
          id, nursery_id, title_ar, title_en, description_ar, description_en,
          starts_at, ends_at, location, category, is_urgent,
          urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly,
          is_paid, price,
          target_scope, target_class_id, status, cancelled_at, permission_deadline,
          classes (name_ar, name_en)
        `,
        )
        .eq('id', eventId)
        .maybeSingle();

      if (eventRes.error) throw eventRes.error;
      if (!eventRes.data) return null;

      const rawEvent = eventRes.data as ParentEventDetailsEvent & {
        classes?: { name_ar: string; name_en: string } | { name_ar: string; name_en: string }[] | null;
      };
      const { classes: _c, ...eventRest } = rawEvent;
      const names = normalizeClassEmbed(rawEvent);
      const event: ParentEventDetailsEvent = {
        ...eventRest,
        classNameAr: names.classNameAr,
        classNameEn: names.classNameEn,
      };

      const st = String(event.status ?? '').toLowerCase();
      if (st !== 'active' || event.cancelled_at) {
        return null;
      }

      if (!childIds.length) {
        return { event, permissions: [] };
      }

      const permRes = await supabase
        .from('permissions')
        .select(
          `
          id, child_id, status, parent_note, responded_at, deadline,
          children (full_name_ar, full_name_en, avatar_url)
        `,
        )
        .eq('event_id', eventId)
        .in('child_id', childIds);

      if (permRes.error) throw permRes.error;

      type PermRow = {
        id: string;
        child_id: string;
        status: string;
        parent_note: string | null;
        responded_at: string | null;
        deadline: string | null;
        children:
          | { full_name_ar: string; full_name_en: string; avatar_url: string | null }
          | { full_name_ar: string; full_name_en: string; avatar_url: string | null }[]
          | null;
      };

      const permRows = (permRes.data ?? []) as PermRow[];
      const permissionIds = permRows.map((p) => p.id);

      const invoiceByPermission = new Map<string, { id: string; amount: string; status: string }>();
      if (permissionIds.length) {
        const evInvRes = await supabase
          .from('event_invoices')
          .select('permission_id, invoice_id')
          .eq('parent_id', parentId)
          .in('permission_id', permissionIds);
        if (evInvRes.error) throw evInvRes.error;
        const evRows = (evInvRes.data ?? []) as { permission_id: string; invoice_id: string }[];
        const invoiceIds = [...new Set(evRows.map((r) => r.invoice_id))];
        if (invoiceIds.length) {
          const invRes = await supabase.from('invoices').select('id, amount, status').in('id', invoiceIds);
          if (invRes.error) throw invRes.error;
          const invMap = new Map(
            ((invRes.data ?? []) as { id: string; amount: string; status: string }[]).map((i) => [i.id, i]),
          );
          for (const row of evRows) {
            const inv = invMap.get(row.invoice_id);
            if (inv) invoiceByPermission.set(row.permission_id, inv);
          }
        }
      }

      const permissions: ParentEventDetailsPermission[] = permRows.map((p) => {
        const ch = p.children;
        const child = Array.isArray(ch) ? ch[0] : ch;
        return {
          id: p.id,
          child_id: p.child_id,
          status: p.status,
          parent_note: p.parent_note,
          responded_at: p.responded_at,
          deadline: p.deadline,
          childNameAr: child?.full_name_ar ?? '',
          childNameEn: child?.full_name_en ?? '',
          avatar_url: child?.avatar_url ?? null,
          invoice: invoiceByPermission.get(p.id) ?? null,
        };
      });

      return { event, permissions };
    },
    enabled: Boolean(eventId && parentId),
  });
}
