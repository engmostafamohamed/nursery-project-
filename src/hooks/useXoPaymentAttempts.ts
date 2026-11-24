import { useQuery } from '@tanstack/react-query';

import { callRpc } from '@/lib/rpc';

export type XoPaymentStatus = 'pending_confirmation' | 'confirmed' | 'failed' | 'cancelled';
/** "cancelled" is the Rejected filter: the server takes in the failed attempts with it. */
export type XoPaymentStatusFilter = 'all' | 'pending_confirmation' | 'confirmed' | 'cancelled';

type Names = { ar: string | null; en: string | null };

export type XoPaymentAttempt = {
  id: string;
  status: XoPaymentStatus;
  amount: number;
  method: string;
  createdAt: string;
  confirmedAt: string | null;
  invoiceNumber: string;
  nursery: Names;
  parent: Names;
  confirmedBy: Names | null;
};

export type XoPaymentCounts = { total: number; pending: number; confirmed: number; rejected: number };

type AttemptRow = {
  id: string;
  status: XoPaymentStatus;
  amount: number | string;
  payment_method: string;
  created_at: string;
  confirmed_at: string | null;
  invoice_number: string;
  nursery_name_ar: string | null;
  nursery_name_en: string | null;
  parent_name_ar: string | null;
  parent_name_en: string | null;
  confirmer_name_ar: string | null;
  confirmer_name_en: string | null;
  total_count: number | string;
};

type CountsRow = { total: number | string; pending: number | string; confirmed: number | string; rejected: number | string };

const XO_PAYMENTS_KEY = ['xo-payment-attempts'] as const;

/**
 * One page of the platform's payment attempts for the XO super admin (read-only), newest first,
 * filtered and searched by the server (get_xo_payment_attempts), with how many match in all.
 * Reading them all at once stopped at the server's 1,000-row limit and hid the rest.
 */
export function useXoPaymentAttempts(params: { status: XoPaymentStatusFilter; search: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: [...XO_PAYMENTS_KEY, 'page', params],
    queryFn: async () => {
      const rows = ((await callRpc('get_xo_payment_attempts', {
        p_status: params.status === 'all' ? null : params.status,
        p_search: params.search.trim() || null,
        p_limit: params.pageSize,
        p_offset: (params.page - 1) * params.pageSize,
      })) ?? []) as AttemptRow[];
      return {
        total: Number(rows[0]?.total_count ?? 0),
        rows: rows.map(
          (r): XoPaymentAttempt => ({
            id: r.id,
            status: r.status,
            amount: Number(r.amount ?? 0),
            method: r.payment_method,
            createdAt: r.created_at,
            confirmedAt: r.confirmed_at,
            invoiceNumber: r.invoice_number,
            nursery: { ar: r.nursery_name_ar, en: r.nursery_name_en },
            parent: { ar: r.parent_name_ar, en: r.parent_name_en },
            confirmedBy: r.confirmer_name_ar || r.confirmer_name_en ? { ar: r.confirmer_name_ar, en: r.confirmer_name_en } : null,
          }),
        ),
      };
    },
    // The page being left stays on screen until the next one arrives.
    placeholderData: (previous) => previous,
  });
}

/** Every attempt on the platform counted by status, for the tiles (get_xo_payment_attempt_counts). */
export function useXoPaymentCounts() {
  return useQuery({
    queryKey: [...XO_PAYMENTS_KEY, 'counts'],
    queryFn: async (): Promise<XoPaymentCounts> => {
      const rows = ((await callRpc('get_xo_payment_attempt_counts')) ?? []) as CountsRow[];
      const row = rows[0];
      return {
        total: Number(row?.total ?? 0),
        pending: Number(row?.pending ?? 0),
        confirmed: Number(row?.confirmed ?? 0),
        rejected: Number(row?.rejected ?? 0),
      };
    },
  });
}
