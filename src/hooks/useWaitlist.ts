import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useWaitlist(nurseryId?: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-waitlist', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];
      const res = await supabase
        .from('waitlist')
        .select('*, inquiries(*), classes(id, name_ar, name_en)')
        .eq('nursery_id', nurseryId)
        .order('position', { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(nurseryId),
  });

  const addToWaitlist = useMutation({
    mutationFn: async (payload: { inquiryId: string; nurseryId: string; classId: string }) => {
      const posRes = await supabase
        .from('waitlist')
        .select('position')
        .eq('nursery_id', payload.nurseryId)
        .eq('class_id', payload.classId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (posRes.error) throw posRes.error;
      const nextPos = Number((posRes.data as { position?: number } | null)?.position ?? 0) + 1;

      const insertRes = await supabase.from('waitlist').insert({
        inquiry_id: payload.inquiryId,
        nursery_id: payload.nurseryId,
        class_id: payload.classId,
        position: nextPos,
        status: 'waiting',
      } as never);
      if (insertRes.error) throw insertRes.error;

      const inquiryRes = await supabase.from('inquiries').update({ status: 'waitlisted' } as never).eq('id', payload.inquiryId);
      if (inquiryRes.error) throw inquiryRes.error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-waitlist'] });
      void qc.invalidateQueries({ queryKey: ['admin-inquiries'] });
    },
  });

  const reorderWaitlist = useMutation({
    mutationFn: async (args: { id: string; direction: 'up' | 'down'; classId: string }) => {
      const classRows = (query.data ?? []).filter((w) => String(w.class_id) === args.classId).sort((a, b) => Number(a.position) - Number(b.position));
      const idx = classRows.findIndex((r) => String(r.id) === args.id);
      if (idx < 0) return;
      const swapIdx = args.direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= classRows.length) return;
      const current = classRows[idx];
      const target = classRows[swapIdx];
      const a = Number(current.position);
      const b = Number(target.position);
      const u1 = await supabase.from('waitlist').update({ position: b } as never).eq('id', String(current.id));
      if (u1.error) throw u1.error;
      const u2 = await supabase.from('waitlist').update({ position: a } as never).eq('id', String(target.id));
      if (u2.error) throw u2.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-waitlist'] }),
  });

  const notifyOpening = useMutation({
    mutationFn: async (payload: { waitlistId: string; inquiry: Record<string, unknown>; className: string }) => {
      const updateRes = await supabase.from('waitlist').update({
        status: 'offered',
        notified_at: new Date().toISOString(),
      } as never).eq('id', payload.waitlistId);
      if (updateRes.error) throw updateRes.error;

      const email = String(payload.inquiry.parent_email ?? '');
      const phone = String(payload.inquiry.parent_phone ?? '');
      if (email) {
        await supabase.functions.invoke('email-dispatch', {
          body: {
            trigger_type: 'waitlist_opening',
            recipient_email: email,
            language: 'ar',
            data: { class_name: payload.className },
          },
        });
      }
      if (phone) {
        await supabase.functions.invoke('whatsapp-dispatch', {
          body: {
            trigger_type: 'waitlist_opening',
            recipient_phone: phone,
            language: 'ar',
            data: { class_name: payload.className },
          },
        });
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-waitlist'] }),
  });

  return {
    waitlist: query.data ?? [],
    isLoading: query.isLoading,
    addToWaitlist: addToWaitlist.mutateAsync,
    reorderWaitlist: reorderWaitlist.mutateAsync,
    notifyOpening: notifyOpening.mutateAsync,
  };
}
