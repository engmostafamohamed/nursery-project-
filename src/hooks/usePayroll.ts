import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createStaffPayroll,
  generateMonthlyStaffPayroll,
  markMonthlyStaffPayrollPaid,
  markStaffPayrollPaid,
} from '@/lib/payrollApi';
import { supabase } from '@/lib/supabase';

export type PayrollFilters = {
  month: string;
  department: string;
  status: string;
  search: string;
};

export function usePayroll(nurseryId?: string, userId?: string, filters?: PayrollFilters) {
  const qc = useQueryClient();
  const isStaffView = Boolean(userId) && !nurseryId;

  const adminPayrollQuery = useQuery({
    queryKey: ['staff-payroll-admin', nurseryId, filters?.month, filters?.department, filters?.status, filters?.search],
    queryFn: async () => {
      if (!nurseryId) return [];
      const month = filters?.month ?? new Date().toISOString().slice(0, 7);
      const start = `${month}-01`;
      const endDate = new Date(`${month}-01T00:00:00`);
      endDate.setMonth(endDate.getMonth() + 1, 0);
      const end = endDate.toISOString().slice(0, 10);

      const profilesRes = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (profilesRes.error) throw profilesRes.error;
      const profiles = (profilesRes.data ?? []) as Array<Record<string, unknown>>;
      const staffIds = profiles.map((p) => String(p.id));

      const payrollRes = staffIds.length
        ? await supabase
          .from('staff_payroll')
          .select('*')
          .eq('nursery_id', nurseryId)
          .gte('pay_period_start', start)
          .lte('pay_period_end', end)
        : { data: [], error: null };
      if (payrollRes.error) throw payrollRes.error;
      const payrollRows = (payrollRes.data ?? []) as Array<Record<string, unknown>>;
      const payrollMap = new Map(payrollRows.map((r) => [String(r.staff_id), r]));

      const userIds = profiles.map((p) => String(p.user_id));
      const usersRes = userIds.length
        ? await supabase.from('users').select('id, name_ar, name_en, email, status').in('id', userIds)
        : { data: [], error: null };
      if (usersRes.error) throw usersRes.error;
      const userMap = new Map(((usersRes.data ?? []) as Array<Record<string, unknown>>).map((u) => [String(u.id), u]));

      return profiles
        .map((p) => ({
          profile: p,
          user: userMap.get(String(p.user_id)) ?? null,
          payroll: payrollMap.get(String(p.id)) ?? null,
        }))
        .filter((row) => {
          if (filters?.department && filters.department !== 'all' && String(row.profile.department) !== filters.department) return false;
          if (filters?.status && filters.status !== 'all') {
            const s = String(row.payroll?.payment_status ?? 'pending');
            if (s !== filters.status) return false;
          }
          const q = (filters?.search ?? '').trim().toLowerCase();
          if (!q) return true;
          const u = row.user as Record<string, unknown> | null;
          const name = String(u?.name_ar ?? u?.name_en ?? '');
          const employee = String(row.profile.employee_id ?? '');
          return `${name} ${employee}`.toLowerCase().includes(q);
        });
    },
    enabled: Boolean(nurseryId),
  });

  const staffPayrollQuery = useQuery({
    queryKey: ['staff-payroll-self', userId, filters?.month],
    queryFn: async () => {
      if (!userId) return [];
      const profileRes = await supabase.from('staff_profiles').select('id').eq('user_id', userId).single();
      if (profileRes.error) throw profileRes.error;
      const staffId = String((profileRes.data as { id: string }).id);
      let q = supabase.from('staff_payroll').select('*').eq('staff_id', staffId).order('pay_period_start', { ascending: false });
      if (filters?.month) q = q.gte('pay_period_start', `${filters.month}-01`).lte('pay_period_end', `${filters.month}-31`);
      const res = await q;
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: isStaffView,
  });

  const createPayslip = useMutation({
    mutationFn: async (payload: {
      staff_id: string;
      nursery_id: string;
      pay_period_start: string;
      pay_period_end: string;
      base_salary: number;
      bonuses: number;
      deductions: number;
      payment_method: 'cash' | 'bank_transfer' | 'check';
      notes: string;
      idempotencyKey: string;
    }) => {
      return createStaffPayroll({
        staffId: payload.staff_id,
        nurseryId: payload.nursery_id,
        periodStart: payload.pay_period_start,
        periodEnd: payload.pay_period_end,
        baseSalary: payload.base_salary,
        bonuses: payload.bonuses,
        deductions: payload.deductions,
        paymentMethod: payload.payment_method,
        notes: payload.notes,
        idempotencyKey: payload.idempotencyKey,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-payroll-admin'] });
      void qc.invalidateQueries({ queryKey: ['staff-payroll-records'] });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (args: { id: string; paymentDate?: string; idempotencyKey: string }) => {
      return markStaffPayrollPaid({
        payrollId: args.id,
        paymentDate: args.paymentDate ?? new Date().toISOString().slice(0, 10),
        idempotencyKey: args.idempotencyKey,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-payroll-admin'] });
      void qc.invalidateQueries({ queryKey: ['staff-payroll-self'] });
      void qc.invalidateQueries({ queryKey: ['staff-payroll-records'] });
    },
  });

  const generateMonthlyPayrollForAll = useMutation({
    mutationFn: async ({
      nurseryId,
      month,
      idempotencyKey,
    }: {
      nurseryId: string;
      month: string;
      idempotencyKey: string;
    }) => {
      const result = await generateMonthlyStaffPayroll({ nurseryId, month, idempotencyKey });
      return result.created_count ?? 0;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff-payroll-admin'] }),
  });

  const bulkMarkPendingPaidForMonth = useMutation({
    mutationFn: async ({
      nurseryId,
      month,
      idempotencyKey,
    }: {
      nurseryId: string;
      month: string;
      idempotencyKey: string;
    }) => {
      const result = await markMonthlyStaffPayrollPaid({ nurseryId, month, idempotencyKey });
      return result.paid_count ?? 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-payroll-admin'] });
      void qc.invalidateQueries({ queryKey: ['staff-payroll-records'] });
    },
  });

  const stats = useMemo(() => {
    const data = adminPayrollQuery.data ?? [];
    let total = 0;
    let paidTotal = 0;
    let paidCount = 0;
    let pendingCount = 0;
    for (const row of data) {
      const p = row.payroll as Record<string, unknown> | null;
      if (p) {
        total += Number(p.total_amount ?? 0);
        if (String(p.payment_status) === 'paid') {
          paidTotal += Number(p.total_amount ?? 0);
          paidCount += 1;
        } else {
          pendingCount += 1;
        }
      } else {
        pendingCount += 1;
        total += Number(row.profile.salary_amount ?? 0);
      }
    }
    return { total, paidTotal, pendingCount, paidCount, staffInView: data.length };
  }, [adminPayrollQuery.data]);

  return {
    adminRows: adminPayrollQuery.data ?? [],
    staffRows: staffPayrollQuery.data ?? [],
    isLoading: adminPayrollQuery.isLoading || staffPayrollQuery.isLoading,
    stats,
    createPayslip: createPayslip.mutateAsync,
    markPaid: markPaid.mutateAsync,
    generateMonthlyPayrollForAll: generateMonthlyPayrollForAll.mutateAsync,
    bulkMarkPendingPaidForMonth: bulkMarkPendingPaidForMonth.mutateAsync,
  };
}
