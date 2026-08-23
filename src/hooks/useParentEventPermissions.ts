import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentEventPermissionItem = {
  permission_id: string;
  event_id: string;
  child_id: string;
  event_title_ar: string;
  event_title_en: string;
  event_category: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  status: string;
  deadline: string | null;
  invoice: { id: string; amount: string; status: string } | null;
};

export function useParentEventPermissions(parentId: string | undefined, searchEventId?: string) {
  const query = useQuery({
    queryKey: ['parent-event-permissions', parentId],
    queryFn: async (): Promise<ParentEventPermissionItem[]> => {
      if (!parentId) return [];
      const linksRes = await supabase
        .from('parent_children')
        .select('child_id')
        .eq('parent_id', parentId);
      if (linksRes.error) throw linksRes.error;
      const childIds = ((linksRes.data ?? []) as { child_id: string }[]).map((row) => row.child_id);
      if (!childIds.length) return [];

      const permissionsRes = await supabase
        .from('permissions')
        .select('id, event_id, child_id, status, deadline')
        .in('child_id', childIds)
        .not('event_id', 'is', null);
      if (permissionsRes.error) throw permissionsRes.error;
      const permissions = (permissionsRes.data ?? []) as {
        id: string;
        event_id: string | null;
        child_id: string;
        status: string;
        deadline: string | null;
      }[];
      const eventIds = [...new Set(permissions.map((p) => p.event_id).filter(Boolean))] as string[];
      if (!eventIds.length) return [];

      const eventsRes = await supabase
        .from('events')
        .select('id, title_ar, title_en, category, starts_at, ends_at, location')
        .in('id', eventIds);
      if (eventsRes.error) throw eventsRes.error;
      const eventMap = new Map(
        ((eventsRes.data ?? []) as {
          id: string;
          title_ar: string;
          title_en: string;
          category: string;
          starts_at: string;
          ends_at: string | null;
          location: string | null;
        }[]).map((event) => [event.id, event]),
      );

      const eventInvoicesRes = await supabase
        .from('event_invoices')
        .select('permission_id, invoice_id, parent_id')
        .eq('parent_id', parentId)
        .in('permission_id', permissions.map((p) => p.id));
      if (eventInvoicesRes.error) throw eventInvoicesRes.error;
      const eventInvoices = (eventInvoicesRes.data ?? []) as {
        permission_id: string;
        invoice_id: string;
        parent_id: string;
      }[];
      const invoiceIds = [...new Set(eventInvoices.map((row) => row.invoice_id))];
      const invoicesRes = invoiceIds.length
        ? await supabase
            .from('invoices')
            .select('id, amount, status')
            .in('id', invoiceIds)
        : { data: [], error: null };
      if (invoicesRes.error) throw invoicesRes.error;
      const invoiceMap = new Map(
        ((invoicesRes.data ?? []) as { id: string; amount: string; status: string }[]).map((row) => [row.id, row]),
      );
      const invoiceByPermission = new Map<string, { id: string; amount: string; status: string }>();
      for (const row of eventInvoices) {
        const invoice = invoiceMap.get(row.invoice_id);
        if (invoice) invoiceByPermission.set(row.permission_id, invoice);
      }

      return permissions
        .filter((permission) => permission.event_id && eventMap.has(permission.event_id))
        .map((permission) => {
          const event = eventMap.get(permission.event_id!);
          return {
            permission_id: permission.id,
            event_id: permission.event_id!,
            child_id: permission.child_id,
            event_title_ar: event?.title_ar ?? '',
            event_title_en: event?.title_en ?? '',
            event_category: event?.category ?? 'activity',
            starts_at: event?.starts_at ?? new Date().toISOString(),
            ends_at: event?.ends_at ?? null,
            location: event?.location ?? null,
            status: permission.status,
            deadline: permission.deadline,
            invoice: invoiceByPermission.get(permission.id) ?? null,
          };
        });
    },
    enabled: Boolean(parentId),
  });

  const filtered = useMemo(() => {
    const list = query.data ?? [];
    if (!searchEventId) return list;
    return list.filter((item) => item.event_id === searchEventId);
  }, [query.data, searchEventId]);

  return { ...query, filtered };
}
