import { useQuery } from '@tanstack/react-query';

import { extraHoursDayStatus, type ExtraHoursDay } from '@/lib/familyFinance';
import { supabase } from '@/lib/supabase';

type AttendanceRow = {
  id: string;
  child_id: string;
  attendance_date: string;
  extra_hours: string | number | null;
  extra_hours_covered: string | number | null;
  extra_hours_billed: string | number | null;
  extra_fee: string | number | null;
  late_charge_invoice_id: string | null;
};

const num = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Every late-pickup day of these children, newest first, with what happened to its fee: covered
 * by the package, on an unpaid / in-review / paid invoice, or never invoiced. Row-level security
 * limits a parent to their own children; staff see their nursery.
 */
export function useExtraHoursLedger(childIds: string[]) {
  const ids = [...new Set(childIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['extra-hours-ledger', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<ExtraHoursDay[]> => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, child_id, attendance_date, extra_hours, extra_hours_covered, extra_hours_billed, extra_fee, late_charge_invoice_id')
        .in('child_id', ids)
        .gt('extra_hours', 0)
        .order('attendance_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as AttendanceRow[];

      const invoiceIds = [...new Set(rows.map((row) => row.late_charge_invoice_id).filter((id): id is string => Boolean(id)))];
      const invoices = new Map<string, { status: string; number: string }>();
      const inReview = new Set<string>();
      if (invoiceIds.length) {
        const [invoiceRes, attemptRes] = await Promise.all([
          supabase.from('invoices').select('id, status, generated_invoice_number').in('id', invoiceIds),
          supabase.from('payment_attempts').select('invoice_id').in('invoice_id', invoiceIds).eq('status', 'pending_confirmation'),
        ]);
        if (invoiceRes.error) throw invoiceRes.error;
        if (attemptRes.error) throw attemptRes.error;
        for (const row of (invoiceRes.data ?? []) as Array<{ id: string; status: string; generated_invoice_number: string | null }>) {
          invoices.set(row.id, { status: row.status, number: row.generated_invoice_number ?? row.id.slice(0, 8) });
        }
        for (const row of (attemptRes.data ?? []) as Array<{ invoice_id: string }>) inReview.add(row.invoice_id);
      }

      return rows.map((row) => {
        const invoice = row.late_charge_invoice_id ? invoices.get(row.late_charge_invoice_id) ?? null : null;
        const fee = num(row.extra_fee);
        const coveredHours = num(row.extra_hours_covered);
        return {
          attendanceId: row.id,
          childId: row.child_id,
          date: row.attendance_date,
          hours: num(row.extra_hours),
          coveredHours,
          billedHours: num(row.extra_hours_billed),
          fee,
          invoiceId: row.late_charge_invoice_id,
          invoiceNumber: invoice?.number ?? null,
          status: extraHoursDayStatus({
            fee,
            coveredHours,
            invoiceId: row.late_charge_invoice_id,
            invoiceStatus: invoice?.status ?? null,
            inReview: row.late_charge_invoice_id ? inReview.has(row.late_charge_invoice_id) : false,
          }),
        };
      });
    },
  });
}
