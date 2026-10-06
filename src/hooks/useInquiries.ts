import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { templateNotificationRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';

export type InquiryFilters = {
  status: string;
  source: string;
  assignedTo: string;
  search: string;
  fromDate: string;
  toDate: string;
};

type InquiryView = Record<string, unknown> & {
  assigned_user: Record<string, unknown> | null;
};

export function useInquiries(nurseryId?: string, filters?: InquiryFilters) {
  const qc = useQueryClient();

  const classesQuery = useQuery({
    queryKey: ['public-inquiry-classes', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];
      const res = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(nurseryId),
  });

  const adminQuery = useQuery({
    queryKey: ['admin-inquiries', nurseryId, filters],
    queryFn: async () => {
      if (!nurseryId) return [];
      let q = supabase.from('inquiries').select('*').eq('nursery_id', nurseryId).order('created_at', { ascending: false });
      if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters?.source && filters.source !== 'all') q = q.eq('source', filters.source);
      if (filters?.assignedTo && filters.assignedTo !== 'all') q = q.eq('assigned_to', filters.assignedTo);
      if (filters?.fromDate) q = q.gte('created_at', `${filters.fromDate}T00:00:00`);
      if (filters?.toDate) q = q.lte('created_at', `${filters.toDate}T23:59:59`);
      const res = await q;
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const assignees = [...new Set(rows.map((r) => String(r.assigned_to ?? '')).filter(Boolean))];
      const usersRes = assignees.length
        ? await supabase.from('users').select('id, full_name_ar:name_ar, full_name_en:name_en').in('id', assignees)
        : { data: [], error: null };
      if (usersRes.error) throw usersRes.error;
      const userMap = new Map(((usersRes.data ?? []) as Array<Record<string, unknown>>).map((u) => [String(u.id), u]));
      return rows
        .map((r) => ({ ...r, assigned_user: userMap.get(String(r.assigned_to ?? '')) ?? null }))
        .filter((r: Record<string, unknown>) => {
          const s = (filters?.search ?? '').trim().toLowerCase();
          if (!s) return true;
          return `${String(r.parent_name ?? '')} ${String(r.child_name ?? '')}`.toLowerCase().includes(s);
        }) as InquiryView[];
    },
    enabled: Boolean(nurseryId),
  });

  const submitPublicInquiry = useMutation({
    mutationFn: async (payload: {
      nursery_id: string;
      parent_name: string;
      parent_email: string;
      parent_phone: string;
      child_name: string;
      child_dob: string;
      preferred_class: string;
      preferred_start_date: string;
      source: 'website' | 'referral' | 'walk_in' | 'social_media' | 'other';
      message: string;
    }) => {
      // No .select(): visitors may INSERT an inquiry but not read it back, and reading the new
      // row would make RLS reject the whole insert for logged-out users.
      const inquiryRes = await supabase.from('inquiries').insert({
        ...payload,
        status: 'new',
      } as never);
      if (inquiryRes.error) throw inquiryRes.error;

      const adminsRes = await supabase
        .from('users')
        .select('id')
        .eq('nursery_id', payload.nursery_id)
        .in('role', ['branch_admin', 'chain_super_admin']);
      if (!adminsRes.error) {
        const adminIds = ((adminsRes.data ?? []) as Array<{ id: string }>).map((a) => a.id);
        if (adminIds.length) {
          await supabase.from('notifications').insert(
            adminIds.map((id) =>
              templateNotificationRow({
                nurseryId: payload.nursery_id,
                userId: id,
                type: 'admission_inquiry_new',
                params: { parent: payload.parent_name },
                actionLink: '/admin/admissions/inquiries',
                channel: 'push',
              }),
            ) as never,
          );
        }
      }

      await supabase.functions.invoke('email-dispatch', {
        body: {
          trigger_type: 'inquiry_confirmation',
          recipient_email: payload.parent_email,
          language: 'ar',
          nursery_id: payload.nursery_id,
          data: {
            parent_name: payload.parent_name,
            child_name: payload.child_name,
          },
        },
      });
    },
  });

  const updateInquiry = useMutation({
    mutationFn: async (payload: { id: string; updates: Record<string, unknown> }) => {
      const res = await supabase.from('inquiries').update(payload.updates as never).eq('id', payload.id);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-inquiries'] }),
  });

  const nowMs = useMemo(() => Date.now(), []);
  const stats = useMemo(() => {
    const rows = adminQuery.data ?? [];
    const weekAgo = nowMs - 7 * 24 * 3600 * 1000;
    const newThisWeek = rows.filter((r) => String(r.status) === 'new' && +new Date(String(r.created_at)) >= weekAgo).length;
    const enrolled = rows.filter((r) => String(r.status) === 'enrolled').length;
    const conversionRate = rows.length ? (enrolled / rows.length) * 100 : 0;
    const responseTimes = rows
      .filter((r) => ['contacted', 'scheduled', 'waitlisted', 'enrolled'].includes(String(r.status)))
      .map((r) => Math.max(0, (+new Date(String(r.updated_at)) - +new Date(String(r.created_at))) / 3600000));
    const avgResponseHours = responseTimes.length ? responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length : 0;
    return { newThisWeek, conversionRate, avgResponseHours };
  }, [adminQuery.data, nowMs]);

  return {
    classes: classesQuery.data ?? [],
    inquiries: adminQuery.data ?? [],
    isLoading: adminQuery.isLoading || classesQuery.isLoading,
    stats,
    submitPublicInquiry: submitPublicInquiry.mutateAsync,
    updateInquiry: updateInquiry.mutateAsync,
  };
}
