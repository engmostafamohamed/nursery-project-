import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const adminEventDetailQueryKey = (eventId: string | undefined, nurseryId: string | undefined | null) =>
  ['admin-event-detail', eventId, nurseryId] as const;

export const adminEventDetailAttendanceQueryKey = (eventId: string | undefined, nurseryId: string | undefined | null) =>
  ['admin-event-detail-attendance', eventId, nurseryId] as const;

export type AdminEventDetailRow = {
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

export type AdminEventAttendanceRow = {
  permission_id: string;
  child_id: string;
  child_name_ar: string;
  child_name_en: string;
  avatar_url: string | null;
  parent_id: string | null;
  parent_name_ar: string;
  parent_name_en: string;
  status: string;
  responded_at: string | null;
  parent_note: string | null;
  invoice_status: string | null;
  invoice_amount: string | null;
};

function normalizeClassEmbed(
  raw: AdminEventDetailRow & { classes?: { name_ar: string; name_en: string } | { name_ar: string; name_en: string }[] | null },
): Pick<AdminEventDetailRow, 'classNameAr' | 'classNameEn'> {
  const cls = raw.classes;
  const one = Array.isArray(cls) ? cls[0] : cls;
  return {
    classNameAr: one?.name_ar ?? null,
    classNameEn: one?.name_en ?? null,
  };
}

export function useAdminEventDetail(eventId: string | undefined, nurseryId: string | undefined | null) {
  return useQuery({
    queryKey: adminEventDetailQueryKey(eventId, nurseryId),
    queryFn: async (): Promise<AdminEventDetailRow | null> => {
      if (!eventId || !nurseryId) return null;
      const { data, error } = await supabase
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
        .eq('nursery_id', nurseryId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const raw = data as AdminEventDetailRow & {
        classes?: { name_ar: string; name_en: string } | { name_ar: string; name_en: string }[] | null;
      };
      const { classes: _c, ...rest } = raw;
      const names = normalizeClassEmbed(raw);
      return {
        ...rest,
        classNameAr: names.classNameAr,
        classNameEn: names.classNameEn,
      };
    },
    enabled: Boolean(eventId && nurseryId),
  });
}

export function useAdminEventAttendance(eventId: string | undefined, nurseryId: string | undefined | null) {
  return useQuery({
    queryKey: adminEventDetailAttendanceQueryKey(eventId, nurseryId),
    queryFn: async (): Promise<AdminEventAttendanceRow[]> => {
      if (!eventId || !nurseryId) return [];

      const permRes = await supabase
        .from('permissions')
        .select('id, child_id, status, responded_at, parent_note')
        .eq('event_id', eventId);
      if (permRes.error) throw permRes.error;
      const permissions = (permRes.data ?? []) as {
        id: string;
        child_id: string;
        status: string;
        responded_at: string | null;
        parent_note: string | null;
      }[];
      if (!permissions.length) return [];

      const childIds = [...new Set(permissions.map((p) => p.child_id))];

      const childrenRes = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, avatar_url')
        .in('id', childIds);
      if (childrenRes.error) throw childrenRes.error;
      const childMap = new Map(
        ((childrenRes.data ?? []) as {
          id: string;
          full_name_ar: string;
          full_name_en: string;
          avatar_url: string | null;
        }[]).map((c) => [c.id, c]),
      );

      const linksRes = await supabase
        .from('parent_children')
        .select('child_id, parent_id, created_at')
        .in('child_id', childIds)
        .order('created_at', { ascending: true });
      if (linksRes.error) throw linksRes.error;
      const links = (linksRes.data ?? []) as { child_id: string; parent_id: string; created_at: string }[];
      const parentByChild = new Map<string, string>();
      for (const link of links) {
        if (!parentByChild.has(link.child_id)) parentByChild.set(link.child_id, link.parent_id);
      }
      const parentIds = [...new Set([...parentByChild.values()])];

      const usersRes = await supabase
        .from('users')
        .select('id, name_ar, name_en')
        .in('id', parentIds);
      if (usersRes.error) throw usersRes.error;
      const userMap = new Map(
        ((usersRes.data ?? []) as { id: string; name_ar: string; name_en: string }[]).map((u) => [u.id, u]),
      );

      const evInvRes = await supabase
        .from('event_invoices')
        .select('permission_id, invoice_id, child_id')
        .eq('event_id', eventId);
      if (evInvRes.error) throw evInvRes.error;
      const evLinks = (evInvRes.data ?? []) as {
        permission_id: string | null;
        invoice_id: string;
        child_id: string;
      }[];
      const invoiceIds = [...new Set(evLinks.map((l) => l.invoice_id))];
      const invoiceByPermission = new Map<string, { status: string; amount: string }>();
      if (invoiceIds.length) {
        const invRes = await supabase.from('invoices').select('id, amount, status').in('id', invoiceIds);
        if (invRes.error) throw invRes.error;
        const invMap = new Map(
          ((invRes.data ?? []) as { id: string; amount: string; status: string }[]).map((i) => [i.id, i]),
        );
        for (const link of evLinks) {
          const inv = invMap.get(link.invoice_id);
          if (!inv) continue;
          if (link.permission_id) {
            invoiceByPermission.set(link.permission_id, { status: inv.status, amount: inv.amount });
          } else {
            const perm = permissions.find((p) => p.child_id === link.child_id);
            if (perm) invoiceByPermission.set(perm.id, { status: inv.status, amount: inv.amount });
          }
        }
      }

      const rows: AdminEventAttendanceRow[] = permissions.map((p) => {
        const child = childMap.get(p.child_id);
        const pid = parentByChild.get(p.child_id) ?? null;
        const parent = pid ? userMap.get(pid) : undefined;
        const inv = invoiceByPermission.get(p.id);
        return {
          permission_id: p.id,
          child_id: p.child_id,
          child_name_ar: child?.full_name_ar ?? '—',
          child_name_en: child?.full_name_en ?? '—',
          avatar_url: child?.avatar_url ?? null,
          parent_id: pid,
          parent_name_ar: parent?.name_ar ?? '—',
          parent_name_en: parent?.name_en ?? '—',
          status: p.status,
          responded_at: p.responded_at,
          parent_note: p.parent_note,
          invoice_status: inv?.status ?? null,
          invoice_amount: inv?.amount ?? null,
        };
      });

      rows.sort((a, b) => {
        const sc = a.status.localeCompare(b.status);
        if (sc !== 0) return sc;
        return a.child_name_en.localeCompare(b.child_name_en);
      });
      return rows;
    },
    enabled: Boolean(eventId && nurseryId),
  });
}
