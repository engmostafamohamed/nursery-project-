import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type AdminInvoiceStatusFilter = 'all' | 'pending' | 'paid' | 'overdue' | 'cancelled';
export type AdminInvoiceTypeFilter = 'all' | 'monthly' | 'event' | 'extra_hours' | 'other';
export type AdminInvoiceSort =
  | 'created_desc'
  | 'created_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'due_date_asc'
  | 'due_date_desc';

export interface UseAdminInvoicesParams {
  nurseryId?: string;
  search: string;
  status: AdminInvoiceStatusFilter;
  type: AdminInvoiceTypeFilter;
  fromDate?: string;
  toDate?: string;
  dateField: 'created_at' | 'due_date';
  sort: AdminInvoiceSort;
}

export type AdminInvoiceItem = {
  id: string;
  invoiceNumber: string;
  parentId: string;
  parentName: string;
  childNames: string[];
  amount: number;
  type: 'monthly' | 'event' | 'extra_hours' | 'other';
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  dueDate: string;
  createdAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  overdueDays: number;
};

export function useAdminInvoices(params: UseAdminInvoicesParams) {
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const query = useQuery({
    queryKey: ['admin-invoices', params, page],
    queryFn: async () => {
      if (!params.nurseryId) return [] as AdminInvoiceItem[];

      let queryBuilder = supabase
        .from('invoices')
        .select('id, generated_invoice_number, parent_id, amount, invoice_type, status, due_date, created_at, paid_at, payment_method')
        .eq('nursery_id', params.nurseryId)
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (params.type !== 'all') queryBuilder = queryBuilder.eq('invoice_type', params.type);
      if (params.status === 'pending') queryBuilder = queryBuilder.eq('status', 'pending');
      if (params.status === 'paid') queryBuilder = queryBuilder.eq('status', 'paid');
      if (params.status === 'cancelled') queryBuilder = queryBuilder.eq('status', 'cancelled');
      if (params.fromDate) queryBuilder = queryBuilder.gte(params.dateField, params.fromDate);
      if (params.toDate) queryBuilder = queryBuilder.lte(params.dateField, `${params.toDate}T23:59:59`);

      const { data, error } = await queryBuilder;
      if (error) throw error;
      const invoices = (data ?? []) as Array<{
        id: string;
        generated_invoice_number: string | null;
        parent_id: string;
        amount: string;
        invoice_type: 'monthly' | 'event' | 'extra_hours' | 'other';
        status: 'pending' | 'paid' | 'cancelled';
        due_date: string;
        created_at: string;
        paid_at: string | null;
        payment_method: string | null;
      }>;

      const parentIds = [...new Set(invoices.map((row) => row.parent_id))];
      const parentUsersRes = parentIds.length
        ? await supabase.from('users').select('id, name_ar, name_en').in('id', parentIds)
        : { data: [], error: null };
      if (parentUsersRes.error) throw parentUsersRes.error;
      const parentMap = new Map(
        ((parentUsersRes.data ?? []) as { id: string; name_ar: string | null; name_en: string | null }[]).map((u) => [
          u.id,
          u.name_ar || u.name_en || 'Parent',
        ]),
      );

      const parentChildrenRes = parentIds.length
        ? await supabase.from('parent_children').select('parent_id, child_id').in('parent_id', parentIds)
        : { data: [], error: null };
      if (parentChildrenRes.error) throw parentChildrenRes.error;
      const parentChildren = (parentChildrenRes.data ?? []) as { parent_id: string; child_id: string }[];
      const childIds = [...new Set(parentChildren.map((row) => row.child_id))];
      const childrenRes = childIds.length
        ? await supabase.from('children').select('id, full_name_ar, full_name_en').in('id', childIds)
        : { data: [], error: null };
      if (childrenRes.error) throw childrenRes.error;
      const childMap = new Map(
        ((childrenRes.data ?? []) as { id: string; full_name_ar: string; full_name_en: string }[]).map((c) => [
          c.id,
          c.full_name_ar || c.full_name_en || 'Child',
        ]),
      );

      const childNamesByParent = parentChildren.reduce<Record<string, string[]>>((acc, row) => {
        const label = childMap.get(row.child_id);
        if (!label) return acc;
        const current = acc[row.parent_id] ?? [];
        if (!current.includes(label)) current.push(label);
        acc[row.parent_id] = current;
        return acc;
      }, {});

      return invoices.map((row) => {
        const due = new Date(row.due_date);
        const now = new Date();
        const overdue = row.status === 'pending' && due.getTime() < now.getTime();
        const overdueDays = overdue ? Math.ceil((now.getTime() - due.getTime()) / 86400000) : 0;
        return {
          id: row.id,
          invoiceNumber: row.generated_invoice_number ?? row.id.slice(0, 8),
          parentId: row.parent_id,
          parentName: parentMap.get(row.parent_id) ?? 'Parent',
          childNames: childNamesByParent[row.parent_id] ?? [],
          amount: Number(row.amount ?? 0),
          type: row.invoice_type,
          status: overdue ? 'overdue' : row.status,
          dueDate: row.due_date,
          createdAt: row.created_at,
          paidAt: row.paid_at,
          paymentMethod: row.payment_method,
          overdueDays,
        } as AdminInvoiceItem;
      });
    },
    enabled: Boolean(params.nurseryId),
  });

  const filtered = useMemo(() => {
    let rows = query.data ?? [];
    if (params.status === 'overdue') rows = rows.filter((row) => row.status === 'overdue');
    if (params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      rows = rows.filter((row) => row.parentName.toLowerCase().includes(q) || row.invoiceNumber.toLowerCase().includes(q));
    }
    const sorted = [...rows];
    if (params.sort === 'created_desc') sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    if (params.sort === 'created_asc') sorted.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    if (params.sort === 'amount_desc') sorted.sort((a, b) => b.amount - a.amount);
    if (params.sort === 'amount_asc') sorted.sort((a, b) => a.amount - b.amount);
    if (params.sort === 'due_date_asc') sorted.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
    if (params.sort === 'due_date_desc') sorted.sort((a, b) => +new Date(b.dueDate) - +new Date(a.dueDate));
    return sorted;
  }, [params.search, params.sort, params.status, query.data]);

  return {
    data: filtered,
    isLoading: query.isLoading,
    error: query.error,
    page,
    pageSize,
    setPage,
    refetch: query.refetch,
  };
}
