import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { BillingPeriodKind } from './useAdminTuitionBillingPeriods';

export const childBillingKey = (childId: string | null | undefined) => ['admin-child-billing', childId] as const;

export type ChildTuitionSubscription = {
  id: string;
  tuitionPackageId: string | null;
  packageNameAr: string;
  packageNameEn: string;
  billingPeriod: BillingPeriodKind;
  durationMonths: number;
  lockedPrice: number;
  nextInvoiceDate: string;
  startedAt: string;
};

export type ChildExtraHoursAssignment = {
  id: string;
  packageId: string;
  packageNameAr: string;
  packageNameEn: string;
  coverageType: 'unlimited' | 'hours_quota';
  includedHours: number | null;
  hoursUsed: number;
  expiresAt: string | null;
};

export type ChildBillingInvoice = {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  invoiceType: 'monthly' | 'event' | 'extra_hours' | 'other';
  dueDate: string;
  createdAt: string;
  /** Completed payments. */
  paidAmount: number;
  /** Still owed (0 once paid or cancelled). */
  balance: number;
  /** A parent payment is waiting for finance confirmation. */
  inReview: boolean;
  payments: Array<{ amount: number; paidAt: string | null; method: string | null }>;
};

type InvoiceRow = {
  id: string;
  generated_invoice_number: string | null;
  amount: string | number;
  status: ChildBillingInvoice['status'];
  invoice_type: ChildBillingInvoice['invoiceType'];
  due_date: string;
  created_at: string;
  payments: Array<{ amount: string | number; status: string; paid_at: string | null; method: string | null }> | null;
  payment_attempts: Array<{ status: string }> | null;
};

const INVOICE_COLUMNS =
  'id, generated_invoice_number, amount, status, invoice_type, due_date, created_at, payments ( amount, status, paid_at, method ), payment_attempts ( status )';

export type TuitionPackageChoice = {
  id: string;
  nameAr: string;
  nameEn: string;
  periods: { billingPeriod: BillingPeriodKind; durationMonths: number; price: number }[];
};

export type ExtraHoursPackageChoice = {
  id: string;
  nameAr: string;
  nameEn: string;
  coverageType: 'unlimited' | 'hours_quota';
  includedHours: number | null;
  price: number;
};

function money(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function useAdminChildBilling(childId: string | null | undefined, nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = childBillingKey(childId);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!childId) {
        return {
          subscription: null as ChildTuitionSubscription | null,
          extraHours: null as ChildExtraHoursAssignment | null,
          invoices: [] as ChildBillingInvoice[],
        };
      }

      // The application invoice carries the application, not the child: find it through the
      // child's applications so the admission payment is part of the child's history.
      const { data: appRows, error: appError } = await supabase.from('applications').select('id').eq('child_id', childId);
      if (appError) throw appError;
      const applicationIds = ((appRows ?? []) as Array<{ id: string }>).map((row) => row.id);

      const [subRes, pkgRes, invRes, appInvRes] = await Promise.all([
        supabase
          .from('child_tuition_subscriptions')
          .select('id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en, billing_period, duration_months, locked_price, next_invoice_date, started_at')
          .eq('child_id', childId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('child_packages')
          .select('id, package_id, hours_used, expires_at, packages (name_ar, name_en, coverage_type, included_hours)')
          .eq('child_id', childId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('invoices')
          .select(INVOICE_COLUMNS)
          .eq('nursery_id', nurseryId ?? '')
          .eq('line_items_json->>child_id', childId)
          .order('created_at', { ascending: false })
          .limit(200),
        applicationIds.length
          ? supabase
              .from('invoices')
              .select(INVOICE_COLUMNS)
              .eq('nursery_id', nurseryId ?? '')
              .in('line_items_json->>application_id', applicationIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (subRes.error) throw subRes.error;
      if (pkgRes.error) throw pkgRes.error;
      if (invRes.error) throw invRes.error;
      if (appInvRes.error) throw appInvRes.error;
      const invoiceRows = new Map<string, InvoiceRow>();
      for (const row of [...((invRes.data ?? []) as InvoiceRow[]), ...((appInvRes.data ?? []) as InvoiceRow[])]) {
        invoiceRows.set(row.id, row);
      }

      const subRow = subRes.data as {
        id: string;
        tuition_package_id: string | null;
        tuition_package_name_ar: string;
        tuition_package_name_en: string;
        billing_period: BillingPeriodKind;
        duration_months: number;
        locked_price: string | number;
        next_invoice_date: string;
        started_at: string;
      } | null;

      const pkgRow = pkgRes.data as {
        id: string;
        package_id: string;
        hours_used: string | number;
        expires_at: string | null;
        packages: { name_ar: string; name_en: string; coverage_type: 'unlimited' | 'hours_quota'; included_hours: number | null } | Array<{ name_ar: string; name_en: string; coverage_type: 'unlimited' | 'hours_quota'; included_hours: number | null }> | null;
      } | null;
      const pkgInfo = pkgRow ? (Array.isArray(pkgRow.packages) ? pkgRow.packages[0] : pkgRow.packages) : null;

      return {
        subscription: subRow
          ? {
              id: subRow.id,
              tuitionPackageId: subRow.tuition_package_id,
              packageNameAr: subRow.tuition_package_name_ar,
              packageNameEn: subRow.tuition_package_name_en,
              billingPeriod: subRow.billing_period,
              durationMonths: subRow.duration_months,
              lockedPrice: money(subRow.locked_price),
              nextInvoiceDate: subRow.next_invoice_date,
              startedAt: subRow.started_at,
            }
          : null,
        extraHours:
          pkgRow && pkgInfo
            ? {
                id: pkgRow.id,
                packageId: pkgRow.package_id,
                packageNameAr: pkgInfo.name_ar,
                packageNameEn: pkgInfo.name_en,
                coverageType: pkgInfo.coverage_type,
                includedHours: pkgInfo.included_hours,
                hoursUsed: money(pkgRow.hours_used),
                expiresAt: pkgRow.expires_at,
              }
            : null,
        invoices: [...invoiceRows.values()]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((row) => {
            const amount = money(row.amount);
            const completed = (row.payments ?? []).filter((payment) => payment.status === 'completed');
            const paidAmount = completed.reduce((sum, payment) => sum + money(payment.amount), 0);
            const open = row.status !== 'paid' && row.status !== 'cancelled';
            return {
              id: row.id,
              invoiceNumber: row.generated_invoice_number ?? row.id.slice(0, 8),
              amount,
              status: row.status,
              invoiceType: row.invoice_type,
              dueDate: row.due_date,
              createdAt: row.created_at,
              paidAmount,
              balance: open ? Math.max(0, amount - paidAmount) : 0,
              inReview: open && (row.payment_attempts ?? []).some((attempt) => attempt.status === 'pending_confirmation'),
              payments: completed
                .map((payment) => ({ amount: money(payment.amount), paidAt: payment.paid_at, method: payment.method }))
                .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
            };
          }),
      };
    },
    enabled: Boolean(childId),
  });

  const choicesQuery = useQuery({
    queryKey: ['admin-child-billing-choices', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return { tuitionPackages: [] as TuitionPackageChoice[], extraHoursPackages: [] as ExtraHoursPackageChoice[] };
      const [tpRes, periodsRes, epRes] = await Promise.all([
        supabase.from('tuition_packages').select('id, name_ar, name_en').eq('nursery_id', nurseryId).eq('active', true),
        supabase
          .from('tuition_package_billing_periods')
          .select('tuition_package_id, billing_period, duration_months, price')
          .eq('nursery_id', nurseryId)
          .eq('active', true),
        supabase
          .from('packages')
          .select('id, name_ar, name_en, coverage_type, included_hours, price')
          .eq('nursery_id', nurseryId)
          .eq('active', true),
      ]);
      if (tpRes.error) throw tpRes.error;
      if (periodsRes.error) throw periodsRes.error;
      if (epRes.error) throw epRes.error;

      const periodsByPackage = new Map<string, TuitionPackageChoice['periods']>();
      for (const row of (periodsRes.data ?? []) as Array<{ tuition_package_id: string; billing_period: BillingPeriodKind; duration_months: number; price: string | number }>) {
        const list = periodsByPackage.get(row.tuition_package_id) ?? [];
        list.push({ billingPeriod: row.billing_period, durationMonths: row.duration_months, price: money(row.price) });
        periodsByPackage.set(row.tuition_package_id, list);
      }

      return {
        tuitionPackages: ((tpRes.data ?? []) as Array<{ id: string; name_ar: string; name_en: string }>).map((row) => ({
          id: row.id,
          nameAr: row.name_ar,
          nameEn: row.name_en,
          periods: periodsByPackage.get(row.id) ?? [],
        })),
        extraHoursPackages: ((epRes.data ?? []) as Array<{
          id: string;
          name_ar: string;
          name_en: string;
          coverage_type: 'unlimited' | 'hours_quota';
          included_hours: number | null;
          price: string | number;
        }>).map((row) => ({
          id: row.id,
          nameAr: row.name_ar,
          nameEn: row.name_en,
          coverageType: row.coverage_type,
          includedHours: row.included_hours,
          price: money(row.price),
        })),
      };
    },
    enabled: Boolean(nurseryId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: key });
  };

  const changeSubscription = useMutation({
    mutationFn: async (args: {
      tuitionPackageId: string;
      billingPeriod: BillingPeriodKind;
      effective: 'next_period' | 'immediate';
    }) => {
      if (!childId) throw new Error('Missing child');
      const { data, error } = await supabase.rpc('admin_set_child_tuition_subscription' as never, {
        p_child_id: childId,
        p_tuition_package_id: args.tuitionPackageId,
        p_billing_period: args.billingPeriod,
        p_effective: args.effective,
      } as never);
      if (error) throw error;
      return data as { subscriptionId: string; invoiceId: string | null };
    },
    onSuccess: invalidate,
  });

  const assignExtraHours = useMutation({
    mutationFn: async (packageId: string) => {
      if (!childId || !nurseryId) throw new Error('Missing context');
      await supabase.from('child_packages').update({ status: 'cancelled' } as never).eq('child_id', childId).eq('status', 'active');
      const { error } = await supabase
        .from('child_packages')
        .insert({ package_id: packageId, child_id: childId, nursery_id: nurseryId, status: 'active' } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unassignExtraHours = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('child_packages').update({ status: 'cancelled' } as never).eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { query, choicesQuery, changeSubscription, assignExtraHours, unassignExtraHours };
}
