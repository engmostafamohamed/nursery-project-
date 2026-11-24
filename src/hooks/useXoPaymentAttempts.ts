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

type NameRow = { name_ar: string | null; name_en: string | null };

type AttemptRow = {
  id: string;
  invoice_id: string;
  amount: string;
  payment_method: string;
  status: XoPaymentAttempt['status'];
  created_at: string;
  confirmed_at: string | null;
  invoice: { generated_invoice_number: string | null } | null;
  nursery: NameRow | null;
  parent: NameRow | null;
  confirmer: NameRow | null;
};

const nameOf = (row: NameRow | null) => (row ? row.name_en || row.name_ar || '—' : '—');

/**
 * Platform-wide payment audit for the XO super admin (read-only). One request: the parent, the
 * person who confirmed, the invoice number and the nursery come joined in. Looking them up after,
 * by listing every id in the request, made it too long for the server and the page failed.
 */
export function useXoPaymentAttempts() {
  return useQuery({
    queryKey: ['xo-payment-attempts'],
    queryFn: async (): Promise<XoPaymentAttempt[]> => {
      const { data, error } = await supabase
        .from('payment_attempts')
        .select(
          `id, invoice_id, amount, payment_method, status, created_at, confirmed_at,
           invoice:invoices(generated_invoice_number),
           nursery:nurseries(name_ar, name_en),
           parent:users!payment_attempts_parent_id_fkey(name_ar, name_en),
           confirmer:users!payment_attempts_confirmed_by_fkey(name_ar, name_en)`,
        )
        .order('created_at', { ascending: false });
      if (error) throw error;

      return ((data ?? []) as unknown as AttemptRow[]).map((a) => ({
        id: a.id,
        status: a.status,
        amount: Number(a.amount ?? 0),
        method: a.payment_method,
        createdAt: a.created_at,
        confirmedAt: a.confirmed_at,
        parentName: nameOf(a.parent),
        confirmedByName: a.confirmer ? nameOf(a.confirmer) : null,
        invoiceNumber: a.invoice?.generated_invoice_number ?? a.invoice_id.slice(0, 8),
        nurseryName: nameOf(a.nursery),
      }));
    },
  });
}
