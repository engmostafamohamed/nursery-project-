import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type RangePreset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'custom';

type Invoice = {
  id: string;
  parent_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  created_at: string;
  paid_at: string | null;
  payment_method: string | null;
  invoice_type: 'monthly' | 'event' | 'extra_hours' | 'other';
  payments: Array<{ amount: number; method: string; paid_at: string; status: string }>;
  paidAmount: number;
};

type ParentInfo = {
  name: string;
  email: string | null;
  phone: string | null;
  language: 'ar' | 'en';
};

export function startEndForPreset(preset: RangePreset, customFrom?: string, customTo?: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (preset === 'this_month') {
    start.setDate(1); start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
  } else if (preset === 'last_month') {
    start.setMonth(start.getMonth() - 1, 1); start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
  } else if (preset === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3;
    start.setMonth(q, 1); start.setHours(0, 0, 0, 0);
    end.setMonth(q + 3, 0); end.setHours(23, 59, 59, 999);
  } else if (preset === 'last_quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3 - 3;
    start.setMonth(q, 1); start.setHours(0, 0, 0, 0);
    end.setMonth(q + 3, 0); end.setHours(23, 59, 59, 999);
  } else if (preset === 'this_year') {
    start.setMonth(0, 1); start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31); end.setHours(23, 59, 59, 999);
  } else {
    return {
      from: customFrom ? `${customFrom}T00:00:00` : undefined,
      to: customTo ? `${customTo}T23:59:59` : undefined,
    };
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

export function useFinancialReports(nurseryId: string | undefined, preset: RangePreset, customFrom?: string, customTo?: string) {
  const range = useMemo(() => startEndForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const query = useQuery({
    queryKey: ['financial-reports', nurseryId, preset, customFrom, customTo],
    queryFn: async () => {
      if (!nurseryId) return { invoices: [] as Invoice[], parents: new Map<string, ParentInfo>(), reportNowMs: Date.now() };
      let q = supabase
        .from('invoices')
        .select('id, parent_id, amount, status, due_date, created_at, paid_at, payment_method, invoice_type, payments(amount, method, paid_at, status)')
        .eq('nursery_id', nurseryId);
      if (range.from) q = q.gte('created_at', range.from);
      if (range.to) q = q.lte('created_at', range.to);
      const res = await q;
      if (res.error) throw res.error;
      const invoices = ((res.data ?? []) as Array<{
        id: string;
        parent_id: string;
        amount: string;
        status: 'pending' | 'paid' | 'overdue' | 'cancelled';
        due_date: string;
        created_at: string;
        paid_at: string | null;
        payment_method: string | null;
        invoice_type: 'monthly' | 'event' | 'extra_hours' | 'other';
        payments: Array<{ amount: string | number; method: string; paid_at: string; status: string }> | null;
      }>).map((row) => {
        const payments = (row.payments ?? []).map((payment) => ({
          amount: Number(payment.amount ?? 0),
          method: payment.method,
          paid_at: payment.paid_at,
          status: payment.status,
        }));
        const paidAmount = payments
          .filter((payment) => payment.status === 'completed')
          .reduce((sum, payment) => sum + payment.amount, 0);
        return { ...row, amount: Number(row.amount ?? 0), payments, paidAmount };
      }) as Invoice[];

      const parentIds = [...new Set(invoices.map((i) => i.parent_id))];
      const usersRes = parentIds.length
        ? await supabase.from('users').select('id, name_ar, name_en, email, phone, language_pref').in('id', parentIds)
        : { data: [], error: null };
      if (usersRes.error) throw usersRes.error;
      const parents = new Map<string, ParentInfo>(
        ((usersRes.data ?? []) as { id: string; name_ar: string | null; name_en: string | null; email: string | null; phone: string | null; language_pref: string | null }[]).map((u) => [
          u.id,
          {
            name: u.name_ar || u.name_en || 'Parent',
            email: u.email,
            phone: u.phone,
            language: (u.language_pref === 'en' ? 'en' : 'ar') as 'ar' | 'en',
          },
        ]),
      );
      return { invoices, parents, reportNowMs: Date.now() };
    },
    enabled: Boolean(nurseryId),
  });

  const data = useMemo(() => {
    const invoices = query.data?.invoices ?? [];
    const totalRevenue = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const outstandingRows = invoices.filter((i) => i.status !== 'cancelled' && i.paidAmount < i.amount);
    const outstandingAmount = outstandingRows.reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount), 0);
    const overdueRows = invoices.filter((i) => i.status === 'overdue');
    const overdueAmount = overdueRows.reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount), 0);
    const reportNowMs = query.data?.reportNowMs ?? 0;
    const avgDaysOverdue = overdueRows.length
      ? Math.round(overdueRows.reduce((s, i) => s + Math.max(0, (reportNowMs - +new Date(i.due_date)) / 86400000), 0) / overdueRows.length)
      : 0;
    const collectionRate = (totalRevenue / Math.max(1, totalRevenue + outstandingAmount)) * 100;

    const revenueByDayMap = new Map<string, number>();
    invoices.forEach((i) => {
      i.payments.filter((payment) => payment.status === 'completed').forEach((payment) => {
        const key = payment.paid_at ? payment.paid_at.slice(0, 10) : i.created_at.slice(0, 10);
        revenueByDayMap.set(key, (revenueByDayMap.get(key) ?? 0) + payment.amount);
      });
    });
    const revenueOverTime = [...revenueByDayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount }));

    const paymentMethods = invoices.reduce<Record<string, { count: number; amount: number }>>((acc, i) => {
      i.payments.filter((payment) => payment.status === 'completed').forEach((payment) => {
        const key = payment.method || i.payment_method || 'unknown';
        const curr = acc[key] ?? { count: 0, amount: 0 };
        curr.count += 1; curr.amount += payment.amount; acc[key] = curr;
      });
      return acc;
    }, {});
    const paymentMethodsData = Object.entries(paymentMethods).map(([method, v]) => ({ method, ...v }));

    const statusData = ['pending', 'partial', 'paid', 'overdue', 'cancelled'].map((status) => {
      const rows = invoices.filter((i) => {
        if (status === 'partial') return i.status !== 'cancelled' && i.paidAmount > 0 && i.paidAmount < i.amount;
        if (status === 'paid') return i.paidAmount >= i.amount || i.status === 'paid';
        return i.status === status && !(i.paidAmount > 0 && i.paidAmount < i.amount);
      });
      return { status, count: rows.length, amount: rows.reduce((s, i) => s + (status === 'paid' ? i.paidAmount : Math.max(0, i.amount - i.paidAmount)), 0) };
    });
    const typesData = ['monthly', 'event', 'extra_hours', 'other'].map((type) => {
      const rows = invoices.filter((i) => i.invoice_type === type);
      return { type, amount: rows.reduce((s, i) => s + i.paidAmount, 0) };
    });

    const parentAgg = new Map<string, { total: number; count: number; lastPaid: string | null }>();
    invoices.filter((i) => i.paidAmount > 0).forEach((i) => {
      const curr = parentAgg.get(i.parent_id) ?? { total: 0, count: 0, lastPaid: null };
      curr.total += i.paidAmount; curr.count += i.payments.filter((payment) => payment.status === 'completed').length;
      for (const payment of i.payments.filter((row) => row.status === 'completed')) {
        if (!curr.lastPaid || +new Date(payment.paid_at) > +new Date(curr.lastPaid)) curr.lastPaid = payment.paid_at;
      }
      parentAgg.set(i.parent_id, curr);
    });
    const topPayingParents = [...parentAgg.entries()]
      .map(([parentId, v]) => ({ parentId, parentName: query.data?.parents.get(parentId)?.name ?? 'Parent', ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    const overdueInvoices = overdueRows.map((i) => ({
      id: i.id,
      invoiceNumber: i.id.slice(0, 8),
      parentId: i.parent_id,
      parentEmail: query.data?.parents.get(i.parent_id)?.email ?? null,
      parentPhone: query.data?.parents.get(i.parent_id)?.phone ?? null,
      parentLanguage: query.data?.parents.get(i.parent_id)?.language ?? 'ar',
      parentName: query.data?.parents.get(i.parent_id)?.name ?? 'Parent',
      amount: Math.max(0, i.amount - i.paidAmount),
      daysOverdue: Math.max(0, Math.ceil((reportNowMs - +new Date(i.due_date)) / 86400000)),
    }));

    return {
      totalRevenue,
      outstandingAmount,
      outstandingCount: outstandingRows.length,
      overdueAmount,
      overdueCount: overdueRows.length,
      avgDaysOverdue,
      collectionRate,
      revenueOverTime,
      paymentMethodsData,
      statusData,
      typesData,
      topPayingParents,
      overdueInvoices,
    };
  }, [query.data]);

  return { ...query, data };
}
