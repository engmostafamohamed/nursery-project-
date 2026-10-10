import { supabase } from '@/lib/supabase';

export type PayrollOperationResult = {
  status: 'created' | 'duplicate' | 'generated' | 'paid' | 'already_paid';
  payroll_id?: string;
  created_count?: number;
  paid_count?: number;
};

export async function createStaffPayroll(input: {
  staffId: string;
  nurseryId: string;
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  bonuses: number;
  deductions: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'check';
  notes: string;
  idempotencyKey: string;
}): Promise<PayrollOperationResult> {
  const { data, error } = await supabase.rpc('create_staff_payroll' as never, {
    p_staff_id: input.staffId,
    p_nursery_id: input.nurseryId,
    p_pay_period_start: input.periodStart,
    p_pay_period_end: input.periodEnd,
    p_base_salary: input.baseSalary,
    p_bonuses: input.bonuses,
    p_deductions: input.deductions,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes,
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as PayrollOperationResult;
}

export async function generateMonthlyStaffPayroll(input: {
  nurseryId: string;
  month: string;
  idempotencyKey: string;
}): Promise<PayrollOperationResult> {
  const { data, error } = await supabase.rpc('generate_monthly_staff_payroll' as never, {
    p_nursery_id: input.nurseryId,
    p_month: `${input.month}-01`,
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as PayrollOperationResult;
}

export async function markStaffPayrollPaid(input: {
  payrollId: string;
  paymentDate: string;
  idempotencyKey: string;
}): Promise<PayrollOperationResult> {
  const { data, error } = await supabase.rpc('mark_staff_payroll_paid' as never, {
    p_payroll_id: input.payrollId,
    p_payment_date: input.paymentDate,
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as PayrollOperationResult;
}

export async function markMonthlyStaffPayrollPaid(input: {
  nurseryId: string;
  month: string;
  idempotencyKey: string;
}): Promise<PayrollOperationResult> {
  const { data, error } = await supabase.rpc('mark_month_staff_payroll_paid' as never, {
    p_nursery_id: input.nurseryId,
    p_month: `${input.month}-01`,
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as PayrollOperationResult;
}
