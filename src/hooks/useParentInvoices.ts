import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { invoiceItemDescription, invoiceRawItems } from '@/lib/invoiceItems';
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

function invoiceApplicationId(raw: unknown): string {
  const obj = raw as { application_id?: unknown; applicationId?: unknown } | null;
  if (typeof obj?.application_id === 'string') return obj.application_id;
  if (typeof obj?.applicationId === 'string') return obj.applicationId;
  return '';
}

function invoiceChildIds(raw: unknown): string[] {
  const obj = raw as { child_id?: unknown; childId?: unknown; child_ids?: unknown; childIds?: unknown } | null;
  const direct = typeof obj?.child_id === 'string' ? obj.child_id : typeof obj?.childId === 'string' ? obj.childId : '';
  const rawList = Array.isArray(obj?.child_ids) ? obj.child_ids : Array.isArray(obj?.childIds) ? obj.childIds : [];
  return [...new Set([direct, ...rawList].filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export function useParentInvoices({ parentId, childId, status, sort }: UseParentInvoicesParams) {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const query = useQuery({
    queryKey: ['parent-invoices', parentId, language],
    queryFn: async () => {
      if (!parentId) return [] as ParentInvoiceItem[];
      const { data, error } = await supabase
        .from('invoices')
        .select('id, generated_invoice_number, amount, invoice_type, status, due_date, created_at, line_items_json')
        .eq('parent_id', parentId);
      if (error) throw error;

      const invoiceIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
      const eventInvoiceMap = new Map<string, string[]>();
      const inReviewSet = new Set<string>();
      const applicationChildMap = new Map<string, string>();
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

        const applicationIds = [
          ...new Set(
            ((data ?? []) as Array<{ line_items_json: unknown }>)
              .map((row) => invoiceApplicationId(row.line_items_json))
              .filter(Boolean),
          ),
        ];
        if (applicationIds.length) {
          const { data: appData, error: appErr } = await supabase
            .from('applications')
            .select('id, child_id')
            .in('id', applicationIds);
          if (appErr) throw appErr;
          for (const row of (appData ?? []) as Array<{ id: string; child_id: string | null }>) {
            if (row.child_id) applicationChildMap.set(row.id, row.child_id);
          }
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
        const firstRawItem = invoiceRawItems(row.line_items_json)[0];
        const firstItem = firstRawItem ? invoiceItemDescription(firstRawItem, language) : '';
        const lineItemChildIds = invoiceChildIds(row.line_items_json);
        const applicationId = invoiceApplicationId(row.line_items_json);
        const applicationChildId = applicationId ? applicationChildMap.get(applicationId) : undefined;
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
          childIds: [...new Set([...(eventInvoiceMap.get(row.id) ?? []), ...lineItemChildIds, applicationChildId].filter(Boolean) as string[])],
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
