import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type DashboardFeedItem =
  | {
      kind: 'child_enrolled';
      id: string;
      at: string;
      childNameAr: string;
      childNameEn: string;
    }
  | {
      kind: 'inquiry';
      id: string;
      at: string;
      parentName: string;
      childName: string;
    }
  | {
      kind: 'payment';
      id: string;
      at: string;
      amount: number;
      parentNameAr: string;
      parentNameEn: string;
    }
  | {
      kind: 'media';
      id: string;
      at: string;
      uploaderNameAr: string;
      uploaderNameEn: string;
    }
  | {
      kind: 'daily_report';
      id: string;
      at: string;
      childNameAr: string;
      childNameEn: string;
      teacherNameAr: string;
      teacherNameEn: string;
    }
  | {
      kind: 'child_check_in';
      id: string;
      at: string;
      childNameAr: string;
      childNameEn: string;
    }
  | {
      kind: 'event_created';
      id: string;
      at: string;
      titleAr: string;
      titleEn: string;
    };

type UserNames = { name_ar: string; name_en: string };

async function fetchUserNamesMap(ids: string[]): Promise<Map<string, UserNames>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, UserNames>();
  if (!uniq.length) return map;
  const { data, error } = await supabase.from('users').select('id, name_ar, name_en').in('id', uniq);
  if (error) throw error;
  for (const row of data ?? []) {
    const r = row as { id: string; name_ar: string; name_en: string };
    map.set(r.id, { name_ar: r.name_ar, name_en: r.name_en });
  }
  return map;
}

export function useAdminDashboardActivityFeed(nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['admin-dashboard-activity-feed', nurseryId],
    queryFn: async (): Promise<DashboardFeedItem[]> => {
      if (!nurseryId) return [];

      const childIdsRes = await supabase.from('children').select('id').eq('nursery_id', nurseryId);
      if (childIdsRes.error) throw childIdsRes.error;
      const childIds = (childIdsRes.data ?? []).map((r: { id: string }) => r.id);

      const [
        childrenRecent,
        inquiriesRecent,
        mediaRecent,
        reportsRecent,
        eventsRecent,
        attRecent,
        paymentsBlock,
      ] = await Promise.all([
        supabase
          .from('children')
          .select('id, full_name_ar, full_name_en, created_at')
          .eq('nursery_id', nurseryId)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('inquiries')
          .select('id, parent_name, child_name, created_at')
          .eq('nursery_id', nurseryId)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('media')
          .select('id, uploaded_by, created_at')
          .eq('nursery_id', nurseryId)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('daily_reports')
          .select('id, child_id, teacher_id, updated_at, status')
          .eq('nursery_id', nurseryId)
          .eq('status', 'published')
          .order('updated_at', { ascending: false })
          .limit(6),
        supabase
          .from('events')
          .select('id, title_ar, title_en, created_at')
          .eq('nursery_id', nurseryId)
          .order('created_at', { ascending: false })
          .limit(6),
        childIds.length
          ? supabase
              .from('attendance_records')
              .select(
                `
              id,
              check_in,
              child_id,
              children ( full_name_ar, full_name_en )
            `,
              )
              .in('child_id', childIds)
              .not('check_in', 'is', null)
              .order('check_in', { ascending: false })
              .limit(6)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('invoices').select('id').eq('nursery_id', nurseryId),
      ]);

      if (childrenRecent.error) throw childrenRecent.error;
      if (inquiriesRecent.error) throw inquiriesRecent.error;
      if (mediaRecent.error) throw mediaRecent.error;
      if (reportsRecent.error) throw reportsRecent.error;
      if (eventsRecent.error) throw eventsRecent.error;
      if (attRecent.error) throw attRecent.error;
      if (paymentsBlock.error) throw paymentsBlock.error;

      const invoiceIds = (paymentsBlock.data ?? []).map((r: { id: string }) => r.id);
      let paymentsRecent: { data: unknown[] | null; error: { message: string } | null } = {
        data: [],
        error: null,
      };
      if (invoiceIds.length) {
        paymentsRecent = await supabase
          .from('payments')
          .select('id, amount, paid_at, invoice_id')
          .eq('status', 'completed')
          .in('invoice_id', invoiceIds)
          .order('paid_at', { ascending: false })
          .limit(6);
      }
      if (paymentsRecent.error) throw paymentsRecent.error;

      const payInvoiceIds = [
        ...new Set(
          (paymentsRecent.data ?? []).map((row: unknown) => (row as { invoice_id: string }).invoice_id),
        ),
      ];
      const invoiceParentMap = new Map<string, string>();
      if (payInvoiceIds.length) {
        const invParents = await supabase
          .from('invoices')
          .select('id, parent_id')
          .in('id', payInvoiceIds);
        if (invParents.error) throw invParents.error;
        for (const row of invParents.data ?? []) {
          const r = row as { id: string; parent_id: string };
          invoiceParentMap.set(r.id, r.parent_id);
        }
      }

      const parentIds: string[] = [];
      const uploaderIds: string[] = [];
      const teacherIds: string[] = [];
      const reportChildIds: string[] = [];

      for (const row of mediaRecent.data ?? []) {
        uploaderIds.push((row as { uploaded_by: string }).uploaded_by);
      }
      for (const row of reportsRecent.data ?? []) {
        teacherIds.push((row as { teacher_id: string }).teacher_id);
        reportChildIds.push((row as { child_id: string }).child_id);
      }
      for (const row of paymentsRecent.data ?? []) {
        const pid = invoiceParentMap.get((row as { invoice_id: string }).invoice_id);
        if (pid) parentIds.push(pid);
      }

      const [userMap, childNameMap] = await Promise.all([
        fetchUserNamesMap([...parentIds, ...uploaderIds, ...teacherIds]),
        (async () => {
          const uniqC = [...new Set(reportChildIds)];
          const m = new Map<string, { ar: string; en: string }>();
          if (!uniqC.length) return m;
          const { data, error } = await supabase
            .from('children')
            .select('id, full_name_ar, full_name_en')
            .in('id', uniqC);
          if (error) throw error;
          for (const c of data ?? []) {
            const row = c as { id: string; full_name_ar: string; full_name_en: string };
            m.set(row.id, { ar: row.full_name_ar, en: row.full_name_en });
          }
          return m;
        })(),
      ]);

      const items: DashboardFeedItem[] = [];

      for (const row of childrenRecent.data ?? []) {
        const r = row as {
          id: string;
          full_name_ar: string;
          full_name_en: string;
          created_at: string;
        };
        items.push({
          kind: 'child_enrolled',
          id: r.id,
          at: r.created_at,
          childNameAr: r.full_name_ar,
          childNameEn: r.full_name_en,
        });
      }

      for (const row of inquiriesRecent.data ?? []) {
        const r = row as { id: string; parent_name: string; child_name: string; created_at: string };
        items.push({
          kind: 'inquiry',
          id: r.id,
          at: r.created_at,
          parentName: r.parent_name,
          childName: r.child_name,
        });
      }

      for (const row of paymentsRecent.data ?? []) {
        const r = row as { id: string; amount: string | number; paid_at: string; invoice_id: string };
        const par = invoiceParentMap.get(r.invoice_id);
        const names = par ? userMap.get(par) : undefined;
        items.push({
          kind: 'payment',
          id: r.id,
          at: r.paid_at,
          amount: Number(r.amount),
          parentNameAr: names?.name_ar ?? '',
          parentNameEn: names?.name_en ?? '',
        });
      }

      for (const row of mediaRecent.data ?? []) {
        const r = row as { id: string; uploaded_by: string; created_at: string };
        const names = userMap.get(r.uploaded_by);
        items.push({
          kind: 'media',
          id: r.id,
          at: r.created_at,
          uploaderNameAr: names?.name_ar ?? '',
          uploaderNameEn: names?.name_en ?? '',
        });
      }

      for (const row of reportsRecent.data ?? []) {
        const r = row as { id: string; child_id: string; teacher_id: string; updated_at: string };
        const ch = childNameMap.get(r.child_id);
        const tn = userMap.get(r.teacher_id);
        items.push({
          kind: 'daily_report',
          id: r.id,
          at: r.updated_at,
          childNameAr: ch?.ar ?? '',
          childNameEn: ch?.en ?? '',
          teacherNameAr: tn?.name_ar ?? '',
          teacherNameEn: tn?.name_en ?? '',
        });
      }

      for (const row of attRecent.data ?? []) {
        type Ch = { full_name_ar: string; full_name_en: string };
        type Att = { id: string; check_in: string | null; children: Ch | Ch[] };
        const rw = row as Att;
        const ch = Array.isArray(rw.children) ? rw.children[0] : rw.children;
        items.push({
          kind: 'child_check_in',
          id: rw.id,
          at: rw.check_in ?? '',
          childNameAr: ch?.full_name_ar ?? '',
          childNameEn: ch?.full_name_en ?? '',
        });
      }

      for (const row of eventsRecent.data ?? []) {
        const r = row as { id: string; title_ar: string; title_en: string; created_at: string };
        items.push({
          kind: 'event_created',
          id: r.id,
          at: r.created_at,
          titleAr: r.title_ar,
          titleEn: r.title_en,
        });
      }

      items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return items.slice(0, 10);
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 45,
  });
}
