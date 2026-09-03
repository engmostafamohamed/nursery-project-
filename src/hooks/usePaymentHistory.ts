import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type PaymentHistoryInvoiceType = 'monthly' | 'event' | 'extra_hours' | 'other';
export type PaymentHistoryStatus = 'paid' | 'partial' | 'unpaid' | 'in_review' | 'overdue' | 'cancelled';

export type PaymentHistoryRow = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  parentId: string;
  parentName: string;
  amount: number;
  invoiceType: PaymentHistoryInvoiceType;
  status: PaymentHistoryStatus;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  paidAmount: number;
  balanceDue: number;
  paymentMethod: string | null;
  gateway: string;
  gatewayRef: string | null;
  lastAttemptAt: string | null;
  lastAttemptStatus: string | null;
  lastAttemptMethod: string | null;
  description: string;
};

type InvoiceRow = {
  id: string;
  generated_invoice_number: string | null;
  parent_id: string;
  amount: string;
  invoice_type: PaymentHistoryInvoiceType;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  payment_method: string | null;
  line_items_json: unknown;
  payments: Array<{
    id: string;
    amount: string;
    method: string;
    gateway_ref: string | null;
    status: string;
    paid_at: string;
  }> | null;
};

type AttemptRow = {
  id: string;
  invoice_id: string;
  amount: string;
  payment_method: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
};

type ParentRow = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
};

type ApplicationRow = {
  id: string;
  nursery_id: string;
  parent_id: string | null;
};

type PaymentHistoryParams = {
  nurseryId?: string;
  parentId?: string | null;
  applicationId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

function amount(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function firstDescription(raw: unknown): string {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] } | null)?.items)
      ? ((raw as { items: unknown[] }).items)
      : [];
  const first = source[0] as { description?: unknown } | undefined;
  return typeof first?.description === 'string' ? first.description : '';
}

function gatewayFor(method: string | null | undefined): string {
  const m = String(method ?? '').toLowerCase();
  if (!m) return '-';
  if (['paymob', 'card', 'fawry', 'instapay', 'vodafone_cash', 'orange_cash'].includes(m)) return 'Paymob';
  if (m === 'bank_transfer') return 'Bank transfer';
  if (m === 'cash') return 'Cash';
  if (m === 'manual') return 'Manual review';
  return method ?? '-';
}

function invoiceApplicationId(raw: unknown): string {
  const obj = raw as { application_id?: unknown; applicationId?: unknown } | null;
  return typeof obj?.application_id === 'string'
    ? obj.application_id
    : typeof obj?.applicationId === 'string'
      ? obj.applicationId
      : '';
}

function statusFor(invoice: InvoiceRow, latestAttempt: AttemptRow | undefined, paidAmount: number): PaymentHistoryRow['status'] {
  if (invoice.status === 'paid' || paidAmount >= amount(invoice.amount)) return 'paid';
  if (invoice.status === 'cancelled') return 'cancelled';
  if (latestAttempt?.status === 'pending_confirmation') return 'in_review';
  if (paidAmount > 0) return 'partial';
  if (invoice.status === 'overdue') return 'overdue';
  const due = new Date(invoice.due_date).getTime();
  if (Number.isFinite(due) && due < Date.now()) return 'overdue';
  return 'unpaid';
}

function startBound(value: string): string {
  return value.includes('T') ? value : `${value}T00:00:00.000Z`;
}

function endBound(value: string): string {
  return value.includes('T') ? value : `${value}T23:59:59.999Z`;
}

export function usePaymentHistory({ nurseryId, parentId, applicationId, fromDate, toDate, limit = 12 }: PaymentHistoryParams) {
  const query = useQuery({
    queryKey: ['payment-history', nurseryId, parentId, applicationId, fromDate, toDate, limit],
    queryFn: async (): Promise<PaymentHistoryRow[]> => {
      let resolvedParentId = parentId ?? null;
      let resolvedNurseryId = nurseryId ?? null;

      if (applicationId && (!resolvedParentId || !resolvedNurseryId)) {
        const appRes = await supabase
          .from('applications')
          .select('id, nursery_id, parent_id')
          .eq('id', applicationId)
          .maybeSingle();
        if (appRes.error) throw appRes.error;
        const app = appRes.data as ApplicationRow | null;
        resolvedParentId = resolvedParentId ?? app?.parent_id ?? null;
        resolvedNurseryId = resolvedNurseryId ?? app?.nursery_id ?? null;
      }

      if (!resolvedParentId && !resolvedNurseryId) return [];

      let invoiceQuery = supabase
        .from('invoices')
        .select(
          `
          id,
          generated_invoice_number,
          parent_id,
          amount,
          invoice_type,
          status,
          due_date,
          created_at,
          updated_at,
          paid_at,
          payment_method,
          line_items_json,
          payments (
            id,
            amount,
            method,
            gateway_ref,
            status,
            paid_at
          )
        `,
        )
        .order('created_at', { ascending: false });

      if (resolvedNurseryId) invoiceQuery = invoiceQuery.eq('nursery_id', resolvedNurseryId);
      if (resolvedParentId) invoiceQuery = invoiceQuery.eq('parent_id', resolvedParentId);
      if (fromDate) invoiceQuery = invoiceQuery.gte('created_at', startBound(fromDate));
      if (toDate) invoiceQuery = invoiceQuery.lte('created_at', endBound(toDate));
      if (limit > 0 && !applicationId) invoiceQuery = invoiceQuery.limit(limit);

      const invoiceRes = await invoiceQuery;
      if (invoiceRes.error) throw invoiceRes.error;
      const allInvoices = (invoiceRes.data ?? []) as InvoiceRow[];
      const invoices = applicationId
        ? allInvoices.filter((invoice) => invoiceApplicationId(invoice.line_items_json) === applicationId)
        : allInvoices;
      const invoiceIds = invoices.map((i) => i.id);
      const parentIds = [...new Set(invoices.map((i) => i.parent_id))];

      const [attemptsRes, parentsRes] = await Promise.all([
        invoiceIds.length
          ? supabase
              .from('payment_attempts')
              .select('id, invoice_id, amount, payment_method, status, created_at, confirmed_at')
              .in('invoice_id', invoiceIds)
          : Promise.resolve({ data: [], error: null }),
        parentIds.length
          ? supabase.from('users').select('id, name_ar, name_en').in('id', parentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (attemptsRes.error) throw attemptsRes.error;
      if (parentsRes.error) throw parentsRes.error;

      const attemptsByInvoice = new Map<string, AttemptRow>();
      for (const attempt of (attemptsRes.data ?? []) as AttemptRow[]) {
        const current = attemptsByInvoice.get(attempt.invoice_id);
        if (!current || new Date(attempt.created_at).getTime() > new Date(current.created_at).getTime()) {
          attemptsByInvoice.set(attempt.invoice_id, attempt);
        }
      }
      const parents = new Map(
        ((parentsRes.data ?? []) as ParentRow[]).map((p) => [p.id, p.name_ar || p.name_en || 'Parent']),
      );

      return invoices.map((invoice) => {
        const latestPayment = [...(invoice.payments ?? [])].sort(
          (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime(),
        )[0];
        const latestAttempt = attemptsByInvoice.get(invoice.id);
        const method = latestPayment?.method ?? invoice.payment_method ?? latestAttempt?.payment_method ?? null;
        const rawPaidAmount = (invoice.payments ?? [])
          .filter((payment) => payment.status === 'completed')
          .reduce((sum, payment) => sum + amount(payment.amount), 0);
        const invoiceAmount = amount(invoice.amount);
        const paidAmount = Math.min(rawPaidAmount, invoiceAmount);
        return {
          id: `${invoice.id}-${latestPayment?.id ?? latestAttempt?.id ?? 'invoice'}`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.generated_invoice_number ?? invoice.id.slice(0, 8),
          parentId: invoice.parent_id,
          parentName: parents.get(invoice.parent_id) ?? 'Parent',
          amount: invoiceAmount,
          invoiceType: invoice.invoice_type,
          status: statusFor(invoice, latestAttempt, paidAmount),
          dueDate: invoice.due_date,
          createdAt: invoice.created_at,
          updatedAt: invoice.updated_at,
          paidAt: latestPayment?.paid_at ?? invoice.paid_at,
          paidAmount,
          balanceDue: Math.max(0, invoiceAmount - paidAmount),
          paymentMethod: method,
          gateway: gatewayFor(method),
          gatewayRef: latestPayment?.gateway_ref ?? null,
          lastAttemptAt: latestAttempt?.created_at ?? null,
          lastAttemptStatus: latestAttempt?.status ?? null,
          lastAttemptMethod: latestAttempt?.payment_method ?? null,
          description: firstDescription(invoice.line_items_json),
        };
      });
    },
    enabled: Boolean(parentId || nurseryId || applicationId),
  });

  const data = useMemo(() => query.data ?? [], [query.data]);

  return { ...query, data };
}
