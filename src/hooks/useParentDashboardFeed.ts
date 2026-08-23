import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentDashboardFeedItem =
  | {
      kind: 'daily_report';
      id: string;
      at: string;
      childId: string;
      childNameAr: string;
      childNameEn: string;
      reportDate: string;
    }
  | {
      kind: 'media';
      id: string;
      at: string;
      caption: string | null;
      thumbnailUrl: string | null;
    }
  | {
      kind: 'event_invite';
      id: string;
      at: string;
      eventId: string;
      titleAr: string;
      titleEn: string;
    }
  | {
      kind: 'invoice';
      id: string;
      at: string;
      amount: number;
      dueDate: string;
      status: string;
    };

export function useParentDashboardFeed(parentId: string | undefined, nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['parent-dashboard-feed', parentId, nurseryId],
    queryFn: async (): Promise<ParentDashboardFeedItem[]> => {
      if (!parentId || !nurseryId) return [];

      const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', parentId);
      if (linksRes.error) throw linksRes.error;
      const childIds = ((linksRes.data ?? []) as { child_id: string }[]).map((l) => l.child_id);
      if (!childIds.length) return [];

      const childRes = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en')
        .in('id', childIds);
      if (childRes.error) throw childRes.error;
      const childMap = new Map(
        (childRes.data ?? []).map((c: { id: string; full_name_ar: string; full_name_en: string }) => [
          c.id,
          { ar: c.full_name_ar, en: c.full_name_en },
        ]),
      );

      const [reportsRes, invRes, evRes] = await Promise.all([
        supabase
          .from('daily_reports')
          .select('id, child_id, report_date, updated_at')
          .eq('nursery_id', nurseryId)
          .eq('status', 'published')
          .in('child_id', childIds)
          .order('updated_at', { ascending: false })
          .limit(8),
        supabase
          .from('invoices')
          .select('id, amount, due_date, status, updated_at, created_at')
          .eq('parent_id', parentId)
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(8),
        supabase
          .from('events')
          .select('id, title_ar, title_en, created_at, starts_at')
          .eq('nursery_id', nurseryId)
          .is('cancelled_at', null)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (invRes.error) throw invRes.error;
      if (evRes.error) throw evRes.error;

      const items: ParentDashboardFeedItem[] = [];

      for (const r of reportsRes.data ?? []) {
        const row = r as { id: string; child_id: string; report_date: string; updated_at: string };
        const names = childMap.get(row.child_id);
        items.push({
          kind: 'daily_report',
          id: row.id,
          at: row.updated_at,
          childId: row.child_id,
          childNameAr: names?.ar ?? '',
          childNameEn: names?.en ?? '',
          reportDate: row.report_date,
        });
      }

      const mcRes = await supabase.from('media_children').select('media_id').in('child_id', childIds);
      if (mcRes.error) throw mcRes.error;
      const mediaIds = [...new Set((mcRes.data ?? []).map((r: { media_id: string }) => r.media_id))];
      if (mediaIds.length) {
        const medRes = await supabase
          .from('media')
          .select('id, caption, thumbnail_url, created_at, uploaded_at, status, nursery_id')
          .in('id', mediaIds)
          .eq('nursery_id', nurseryId)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(8);
        if (medRes.error) throw medRes.error;
        for (const r of medRes.data ?? []) {
          const row = r as {
            id: string;
            caption: string | null;
            thumbnail_url: string | null;
            created_at: string;
            uploaded_at: string | null;
          };
          items.push({
            kind: 'media',
            id: row.id,
            at: row.uploaded_at ?? row.created_at,
            caption: row.caption,
            thumbnailUrl: row.thumbnail_url,
          });
        }
      }

      for (const r of invRes.data ?? []) {
        const row = r as {
          id: string;
          amount: string;
          due_date: string;
          status: string;
          updated_at: string;
          created_at: string;
        };
        const due = new Date(row.due_date);
        const now = new Date();
        const overdue = row.status === 'pending' && due.getTime() < now.getTime();
        items.push({
          kind: 'invoice',
          id: row.id,
          at: row.updated_at ?? row.created_at,
          amount: Number(row.amount),
          dueDate: row.due_date,
          status: overdue ? 'overdue' : row.status,
        });
      }

      for (const r of evRes.data ?? []) {
        const row = r as { id: string; title_ar: string; title_en: string; created_at: string; starts_at: string };
        items.push({
          kind: 'event_invite',
          id: row.id,
          at: row.created_at,
          eventId: row.id,
          titleAr: row.title_ar,
          titleEn: row.title_en,
        });
      }

      items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return items.slice(0, 10);
    },
    enabled: Boolean(parentId && nurseryId),
    staleTime: 1000 * 60,
  });
}
