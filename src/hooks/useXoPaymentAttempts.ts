import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type XoPaymentAttempt = {
  id: string;
  status: 'pending_confirmation' | 'confirmed' | 'failed' | 'cancelled';
  amount: number;
  method: string;
  createdAt: string;
  confirmedAt: string | null;
  parentName: string;
  confirmedByName: string | null;
  invoiceNumber: string;
  nurseryName: string;
};

type NameRow = { id: string; name_ar: string | null; name_en: string | null };

/** Platform-wide payment audit for the XO super admin (read-only). */
export function useXoPaymentAttempts() {
  return useQuery({
    queryKey: ['xo-payment-attempts'],
    queryFn: async (): Promise<XoPaymentAttempt[]> => {
      const attemptsRes = await supabase
        .from('payment_attempts')
        .select('id, invoice_id, parent_id, nursery_id, amount, payment_method, status, created_at, confirmed_at, confirmed_by')
        .order('created_at', { ascending: false });
      if (attemptsRes.error) throw attemptsRes.error;
      const attempts = (attemptsRes.data ?? []) as Array<{
        id: string;
        invoice_id: string;
        parent_id: string;
        nursery_id: string;
        amount: string;
        payment_method: string;
        status: XoPaymentAttempt['status'];
        created_at: string;
        confirmed_at: string | null;
        confirmed_by: string | null;
      }>;
      if (!attempts.length) return [];

      const userIds = [
        ...new Set(attempts.flatMap((a) => [a.parent_id, a.confirmed_by]).filter((v): v is string => Boolean(v))),
      ];
      const invoiceIds = [...new Set(attempts.map((a) => a.invoice_id))];
      const nurseryIds = [...new Set(attempts.map((a) => a.nursery_id))];

      const [usersRes, invoicesRes, nurseriesRes] = await Promise.all([
        userIds.length ? supabase.from('users').select('id, name_ar, name_en').in('id', userIds) : Promise.resolve({ data: [], error: null }),
        invoiceIds.length ? supabase.from('invoices').select('id, generated_invoice_number').in('id', invoiceIds) : Promise.resolve({ data: [], error: null }),
        nurseryIds.length ? supabase.from('nurseries').select('id, name_ar, name_en').in('id', nurseryIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (nurseriesRes.error) throw nurseriesRes.error;

      const nameOf = (row: NameRow | undefined) => (row ? row.name_en || row.name_ar || '—' : '—');
      const userMap = new Map((usersRes.data as NameRow[]).map((u) => [u.id, u]));
      const invoiceMap = new Map(
        (invoicesRes.data as Array<{ id: string; generated_invoice_number: string | null }>).map((i) => [i.id, i]),
      );
      const nurseryMap = new Map((nurseriesRes.data as NameRow[]).map((n) => [n.id, n]));

      return attempts.map((a) => ({
        id: a.id,
        status: a.status,
        amount: Number(a.amount ?? 0),
        method: a.payment_method,
        createdAt: a.created_at,
        confirmedAt: a.confirmed_at,
        parentName: nameOf(userMap.get(a.parent_id)),
        confirmedByName: a.confirmed_by ? nameOf(userMap.get(a.confirmed_by)) : null,
        invoiceNumber: invoiceMap.get(a.invoice_id)?.generated_invoice_number ?? a.invoice_id.slice(0, 8),
        nurseryName: nameOf(nurseryMap.get(a.nursery_id)),
      }));
    },
  });
}
