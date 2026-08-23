import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  bucketPaymentMethod,
  lastSixMonthBuckets,
  monthKeyFromRange,
  paidOnOrBeforeDueDate,
  paymentMatchesMethodFilter,
  previousIsoRange,
  rangeForPreset,
  type FinancialDashboardPreset,
  type IsoRange,
} from '@/lib/financialDashboardHelpers';
import { supabase } from '@/lib/supabase';

export type PaymentStatusFilter = 'all' | 'pending' | 'completed' | 'failed' | 'refunded';

export type PaymentMethodFilter = 'all' | 'cash' | 'bank_transfer' | 'paymob';

type InvoiceRow = {
  id: string;
  parent_id: string;
  amount: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  created_at: string;
  paid_at: string | null;
  generated_invoice_number: string | null;
  payments: Array<{
    id: string;
    amount: string;
    method: string;
    status: string;
    paid_at: string;
  }> | null;
};

type UserRow = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
};

function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inRange(iso: string, range: IsoRange): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(range.from).getTime() && t <= new Date(range.to).getTime();
}

export function useAdminFinancialDashboard(
  nurseryId: string | undefined,
  preset: FinancialDashboardPreset,
  customFrom: string | undefined,
  customTo: string | undefined,
  paymentStatusFilter: PaymentStatusFilter,
  paymentMethodFilter: PaymentMethodFilter,
) {
  const filterRange = useMemo(
    () => rangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const query = useQuery({
    queryKey: ['admin-financial-dashboard', nurseryId],
    queryFn: async () => {
      if (!nurseryId) {
        return {
          invoices: [] as InvoiceRow[],
          users: new Map<string, UserRow>(),
        };
      }

      const invRes = await supabase
        .from('invoices')
        .select(
          `
          id,
          parent_id,
          amount,
          status,
          due_date,
          created_at,
          paid_at,
          generated_invoice_number,
          payments (
            id,
            amount,
            method,
            status,
            paid_at
          )
        `,
        )
        .eq('nursery_id', nurseryId);

      if (invRes.error) throw invRes.error;

      const invoices = (invRes.data ?? []) as InvoiceRow[];
      const parentIds = [...new Set(invoices.map((i) => i.parent_id))];

      const BATCH_SIZE = 10;
      const allUsers: UserRow[] = [];
      for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
        const batch = parentIds.slice(i, i + BATCH_SIZE);
        const usersRes = await supabase
          .from('users')
          .select('id, name_ar, name_en')
          .in('id', batch);
        if (usersRes.error) throw usersRes.error;
        allUsers.push(...((usersRes.data ?? []) as UserRow[]));
      }

      const users = new Map<string, UserRow>(allUsers.map((u) => [u.id, u]));

      return { invoices, users };
    },
    enabled: Boolean(nurseryId) && (preset !== 'custom' || Boolean(filterRange)),
  });

  const derived = useMemo(() => {
    const invoices = query.data?.invoices ?? [];
    const users = query.data?.users ?? new Map<string, UserRow>();

    const flatPayments = invoices.flatMap((inv) =>
      (inv.payments ?? []).map((p) => ({
        id: p.id,
        amount: num(p.amount),
        method: p.method,
        status: p.status,
        paid_at: p.paid_at,
        invoice_id: inv.id,
        parent_id: inv.parent_id,
        invoice_number: inv.generated_invoice_number,
      })),
    );

    const outstandingRows = invoices.filter((i) => i.status === 'pending' || i.status === 'overdue');
    const outstandingBalance = outstandingRows.reduce((s, i) => s + num(i.amount), 0);

    const nonCancelled = invoices.filter((i) => i.status !== 'cancelled');
    const paidOnTimeCount = nonCancelled.filter(
      (i) => i.status === 'paid' && paidOnOrBeforeDueDate(i.due_date, i.paid_at),
    ).length;
    const collectionRate =
      nonCancelled.length > 0 ? (paidOnTimeCount / nonCancelled.length) * 100 : 100;

    const statusBuckets = (['pending', 'overdue', 'paid', 'cancelled'] as const).map((status) => {
      const rows = invoices.filter((i) => i.status === status);
      return {
        status,
        count: rows.length,
        amount: rows.reduce((s, i) => s + num(i.amount), 0),
      };
    });

    const prevRange = filterRange ? previousIsoRange(filterRange) : null;

    const revenueInRange = (r: IsoRange | null) => {
      if (!r) return 0;
      return flatPayments
        .filter((p) => p.status === 'completed' && inRange(p.paid_at, r))
        .reduce((s, p) => s + p.amount, 0);
    };

    const revenueCurrentPeriod = revenueInRange(filterRange);
    const revenuePreviousPeriod = revenueInRange(prevRange);
    const revenueChangePct =
      revenuePreviousPeriod > 0
        ? ((revenueCurrentPeriod - revenuePreviousPeriod) / revenuePreviousPeriod) * 100
        : revenueCurrentPeriod > 0
          ? 100
          : 0;

    const avgInvoiceInRange = (() => {
      if (!filterRange) return 0;
      const inRangeInvoices = invoices.filter((i) => inRange(i.created_at, filterRange));
      if (!inRangeInvoices.length) return 0;
      return inRangeInvoices.reduce((s, i) => s + num(i.amount), 0) / inRangeInvoices.length;
    })();

    const sixBuckets = lastSixMonthBuckets();
    const monthlyRevenue = sixBuckets.map((b) => {
      const key = monthKeyFromRange(b);
      const total = flatPayments
        .filter((p) => p.status === 'completed' && inRange(p.paid_at, b))
        .reduce((s, p) => s + p.amount, 0);
      return { monthKey: key, label: key, amount: total };
    });

    const sixMonthStart = sixBuckets[0]?.from;
    const sixMonthEnd = sixBuckets[sixBuckets.length - 1]?.to;
    const paymentsLast6Months = flatPayments.filter(
      (p) =>
        p.status === 'completed' &&
        sixMonthStart &&
        sixMonthEnd &&
        inRange(p.paid_at, { from: sixMonthStart, to: sixMonthEnd }),
    );

    const methodAgg: Record<string, { count: number; amount: number }> = {};
    for (const p of paymentsLast6Months) {
      const b = bucketPaymentMethod(p.method);
      const cur = methodAgg[b] ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += p.amount;
      methodAgg[b] = cur;
    }
    const revenueByMethod = (['cash', 'bank_transfer', 'paymob', 'other'] as const)
      .map((method) => ({
        method,
        count: methodAgg[method]?.count ?? 0,
        amount: methodAgg[method]?.amount ?? 0,
      }))
      .filter((r) => r.count > 0 || r.amount > 0);

    const invById = new Map(invoices.map((i) => [i.id, i]));
    const parentTotals = new Map<string, number>();
    for (const p of paymentsLast6Months) {
      const inv = invById.get(p.invoice_id);
      if (!inv) continue;
      parentTotals.set(inv.parent_id, (parentTotals.get(inv.parent_id) ?? 0) + p.amount);
    }
    const topPayingParents = [...parentTotals.entries()]
      .map(([parentId, total]) => ({
        parentId,
        total,
        parentNameAr: users.get(parentId)?.name_ar ?? null,
        parentNameEn: users.get(parentId)?.name_en ?? null,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const recentFiltered = flatPayments
      .filter((p) => {
        if (!filterRange || !inRange(p.paid_at, filterRange)) return false;
        if (paymentStatusFilter !== 'all' && p.status !== paymentStatusFilter) return false;
        if (!paymentMatchesMethodFilter(p.method, paymentMethodFilter)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
      .slice(0, 20)
      .map((p) => {
        const u = users.get(p.parent_id);
        return {
          ...p,
          parentNameAr: u?.name_ar ?? null,
          parentNameEn: u?.name_en ?? null,
        };
      });

    return {
      outstandingBalance,
      outstandingCount: outstandingRows.length,
      collectionRate,
      statusBuckets,
      revenueCurrentPeriod,
      revenuePreviousPeriod,
      revenueChangePct,
      avgInvoiceInRange,
      monthlyRevenue,
      revenueByMethod,
      topPayingParents,
      recentTransactions: recentFiltered,
      filterRange,
      prevRange,
    };
  }, [query.data, filterRange, paymentStatusFilter, paymentMethodFilter]);

  return {
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    ...derived,
  };
}
