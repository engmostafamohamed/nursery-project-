import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type PaymentAttemptItem = {
  id: string;
  invoiceId: string;
  parentId: string;
  parentName: string;
  nurseryId: string;
  amount: number;
  method: string;
  status: 'pending_confirmation' | 'confirmed' | 'failed' | 'cancelled';
  proofUrl: string | null;
  createdAt: string;
  confirmedAt: string | null;
  notes: string | null;
};

export function usePaymentAttempts(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['payment-attempts', invoiceId],
    queryFn: async (): Promise<PaymentAttemptItem[]> => {
      if (!invoiceId) return [];
      const attemptsRes = await supabase
        .from('payment_attempts')
        .select('id, invoice_id, parent_id, nursery_id, amount, payment_method, status, proof_url, created_at, confirmed_at, notes')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });
      if (attemptsRes.error) throw attemptsRes.error;
      const attempts = (attemptsRes.data ?? []) as Array<{
        id: string;
        invoice_id: string;
        parent_id: string;
        nursery_id: string;
        amount: string;
        payment_method: string;
        status: 'pending_confirmation' | 'confirmed' | 'failed' | 'cancelled';
        proof_url: string | null;
        created_at: string;
        confirmed_at: string | null;
        notes: string | null;
      }>;
      const parentIds = [...new Set(attempts.map((row) => row.parent_id))];
      const parentsRes = parentIds.length
        ? await supabase.from('users').select('id, name_ar, name_en').in('id', parentIds)
        : { data: [], error: null };
      if (parentsRes.error) throw parentsRes.error;
      const parentMap = new Map(
        ((parentsRes.data ?? []) as { id: string; name_ar: string | null; name_en: string | null }[]).map((row) => [
          row.id,
          row.name_ar || row.name_en || 'Parent',
        ]),
      );
      return attempts.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        parentId: row.parent_id,
        parentName: parentMap.get(row.parent_id) ?? 'Parent',
        nurseryId: row.nursery_id,
        amount: Number(row.amount ?? 0),
        method: row.payment_method,
        status: row.status,
        proofUrl: row.proof_url,
        createdAt: row.created_at,
        confirmedAt: row.confirmed_at,
        notes: row.notes,
      }));
    },
    enabled: Boolean(invoiceId),
  });
}
