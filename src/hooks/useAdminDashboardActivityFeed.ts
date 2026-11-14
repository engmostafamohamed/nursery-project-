import { useQuery } from '@tanstack/react-query';

import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

/** Check-ins from this many days back: the feed shows recent ones, and the window keeps the read fast. */
const CHECK_IN_DAYS = 7;

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

/** The parent billed for a payment's invoice (embedded as an object, or a one-item list). */
function paymentParentId(row: unknown): string | undefined {
  const invoice = (row as { invoices: { parent_id: string } | { parent_id: string }[] | null }).invoices;
  return (Array.isArray(invoice) ? invoice[0] : invoice)?.parent_id ?? undefined;
}

/** canSeeMoney: payments join the feed only for people who see the nursery's money. */
export function useAdminDashboardActivityFeed(nurseryId: string | undefined, canSeeMoney: boolean | undefined) {
  return useQuery({
    queryKey: ['admin-dashboard-activity-feed', nurseryId, canSeeMoney],
    queryFn: async (): Promise<DashboardFeedItem[]> => {
      if (!nurseryId) return [];

      // Check-ins and payments are filtered by the branch through the child and the invoice on the
      // server: a list of every child or invoice id in the address grows past what the API accepts.
      const [
        childrenRecent,
        inquiriesRecent,
        mediaRecent,
        reportsRecent,
        eventsRecent,
        attRecent,
        paymentsRecent,
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
        supabase
          .from('attendance_records')
          .select('id, check_in, child_id, children!inner ( full_name_ar, full_name_en, nursery_id )')
          .eq('children.nursery_id', nurseryId)
          .gte('attendance_date', addCalendarDaysYmd(getNurseryCalendarDateString(), -CHECK_IN_DAYS))
          .not('check_in', 'is', null)
          .order('check_in', { ascending: false })
          .limit(6),
        canSeeMoney
          ? supabase
              .from('payments')
              .select('id, amount, paid_at, invoice_id, invoices!inner ( parent_id, nursery_id )')
              .eq('status', 'completed')
              .eq('invoices.nursery_id', nurseryId)
              .order('paid_at', { ascending: false })
              .limit(6)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (childrenRecent.error) throw childrenRecent.error;
      if (inquiriesRecent.error) throw inquiriesRecent.error;
      if (mediaRecent.error) throw mediaRecent.error;
      if (reportsRecent.error) throw reportsRecent.error;
      if (eventsRecent.error) throw eventsRecent.error;
      if (attRecent.error) throw attRecent.error;
      if (paymentsRecent.error) throw paymentsRecent.error;

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
        const pid = paymentParentId(row);
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
        const r = row as { id: string; amount: string | number; paid_at: string };
        const par = paymentParentId(row);
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
    enabled: Boolean(nurseryId) && canSeeMoney !== undefined,
    staleTime: 1000 * 45,
  });
}
