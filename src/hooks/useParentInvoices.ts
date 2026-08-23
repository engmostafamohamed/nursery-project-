import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentInvoiceStatusFilter = 'all' | 'pending' | 'paid';
export type ParentInvoiceSort = 'due_soon' | 'newest';

export type ParentInvoiceItem = {
  id: string;
  invoiceNumber: string;
  amount: number;
  type: 'monthly' | 'event' | 'extra_hours' | 'other';
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  /** True when the parent has submitted a payment that finance has not yet confirmed. */
  inReview: boolean;
  dueDate: string;
  createdAt: string;
  description: string;
  overdueDays: number;
  childIds: string[];
};

interface UseParentInvoicesParams {
  parentId?: string;
  childId?: string;
  status: ParentInvoiceStatusFilter;
  sort: ParentInvoiceSort;
}

export function useParentInvoices({ parentId, childId, status, sort }: UseParentInvoicesParams) {
  const query = useQuery({
    queryKey: ['parent-invoices', parentId],
    queryFn: async () => {
      if (!parentId) return [] as ParentInvoiceItem[];
      const { data, error } = await supabase
        .from('invoices')
        .select('id, generated_invoice_number, amount, invoice_type, status, due_date, created_at, line_items_json')
        .eq('parent_id', parentId);
      if (error) throw error;

      const invoiceIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
      let eventInvoiceMap = new Map<string, string[]>();
      const inReviewSet = new Set<string>();
      if (invoiceIds.length > 0) {
        const { data: eiData, error: eiErr } = await supabase
          .from('event_invoices')
          .select('invoice_id, child_id')
          .in('invoice_id', invoiceIds);
        if (eiErr) throw eiErr;
        for (const row of (eiData ?? []) as { invoice_id: string; child_id: string }[]) {
          const existing = eventInvoiceMap.get(row.invoice_id) ?? [];
          existing.push(row.child_id);
          eventInvoiceMap.set(row.invoice_id, existing);
        }

        // Invoices with a payment the parent submitted but finance has not confirmed yet.
        const { data: paData, error: paErr } = await supabase
          .from('payment_attempts')
          .select('invoice_id, status')
          .eq('parent_id', parentId)
          .eq('status', 'pending_confirmation')
          .in('invoice_id', invoiceIds);
        if (paErr) throw paErr;
        for (const row of (paData ?? []) as { invoice_id: string }[]) {
          inReviewSet.add(row.invoice_id);
        }
      }

      return ((data ?? []) as Array<{
        id: string;
        generated_invoice_number: string | null;
        amount: string;
        invoice_type: 'monthly' | 'event' | 'extra_hours' | 'other';
        status: 'pending' | 'paid' | 'cancelled';
        due_date: string;
        created_at: string;
        line_items_json: unknown;
      }>).map((row) => {
        const due = new Date(row.due_date);
        const now = new Date();
        const overdue = row.status === 'pending' && due.getTime() < now.getTime();
        const overdueDays = overdue ? Math.ceil((now.getTime() - due.getTime()) / 86400000) : 0;
        const items = Array.isArray(row.line_items_json) ? row.line_items_json : [];
        const firstItem = (items[0] as { description?: string } | undefined)?.description;
        return {
          id: row.id,
          invoiceNumber: row.generated_invoice_number ?? row.id.slice(0, 8),
          amount: Number(row.amount ?? 0),
          type: row.invoice_type,
          status: overdue ? 'overdue' : row.status,
          inReview: inReviewSet.has(row.id) && row.status !== 'paid' && row.status !== 'cancelled',
          dueDate: row.due_date,
          createdAt: row.created_at,
          description: firstItem ?? '',
          overdueDays,
          childIds: eventInvoiceMap.get(row.id) ?? [],
        } as ParentInvoiceItem;
      });
    },
    enabled: Boolean(parentId),
  });

  const data = useMemo(() => {
    let rows = query.data ?? [];
    if (childId) {
      rows = rows.filter((row) => row.childIds.includes(childId));
    }
    if (status === 'pending') rows = rows.filter((row) => row.status === 'pending' || row.status === 'overdue');
    if (status === 'paid') rows = rows.filter((row) => row.status === 'paid');
    const sorted = [...rows];
    if (sort === 'due_soon') sorted.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
    if (sort === 'newest') sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return sorted;
  }, [query.data, childId, sort, status]);

  return {
    data,
    allData: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
