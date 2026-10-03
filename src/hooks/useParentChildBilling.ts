import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { BillingPeriodKind } from './useAdminTuitionBillingPeriods';

export type ParentChildTuitionSubscription = {
  packageNameAr: string;
  packageNameEn: string;
  billingPeriod: BillingPeriodKind;
  durationMonths: number;
  lockedPrice: number;
  nextInvoiceDate: string;
};

export type ParentChildExtraHours = {
  packageNameAr: string;
  packageNameEn: string;
  coverageType: 'unlimited' | 'hours_quota';
  includedHours: number | null;
  hoursUsed: number;
  expiresAt: string | null;
};

export type ParentChildBilling = {
  childId: string;
  subscription: ParentChildTuitionSubscription | null;
  extraHours: ParentChildExtraHours | null;
};

function money(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** View-only billing summary (package + period + extra-hours balance) per enrolled child.
 * Changing a package or billing period always goes through the nursery admin — parents can
 * only view here and pay what's due (reusing useParentInvoices/useSubmitInvoicePayment). */
export function useParentChildBilling(childIds: string[]) {
  const sortedIds = [...childIds].sort();
  return useQuery({
    queryKey: ['parent-child-billing', sortedIds],
    queryFn: async (): Promise<Record<string, ParentChildBilling>> => {
      if (sortedIds.length === 0) return {};

      const [subRes, pkgRes] = await Promise.all([
        supabase
          .from('child_tuition_subscriptions')
          .select('child_id, tuition_package_name_ar, tuition_package_name_en, billing_period, duration_months, locked_price, next_invoice_date')
          .in('child_id', sortedIds)
          .eq('status', 'active'),
        supabase
          .from('child_packages')
          .select('child_id, hours_used, expires_at, packages (name_ar, name_en, coverage_type, included_hours)')
          .in('child_id', sortedIds)
          .eq('status', 'active'),
      ]);
      if (subRes.error) throw subRes.error;
      if (pkgRes.error) throw pkgRes.error;

      const result: Record<string, ParentChildBilling> = {};
      for (const id of sortedIds) {
        result[id] = { childId: id, subscription: null, extraHours: null };
      }

      for (const row of (subRes.data ?? []) as Array<{
        child_id: string;
        tuition_package_name_ar: string;
        tuition_package_name_en: string;
        billing_period: BillingPeriodKind;
        duration_months: number;
        locked_price: string | number;
        next_invoice_date: string;
      }>) {
        if (!result[row.child_id]) continue;
        result[row.child_id].subscription = {
          packageNameAr: row.tuition_package_name_ar,
          packageNameEn: row.tuition_package_name_en,
          billingPeriod: row.billing_period,
          durationMonths: row.duration_months,
          lockedPrice: money(row.locked_price),
          nextInvoiceDate: row.next_invoice_date,
        };
      }

      for (const row of (pkgRes.data ?? []) as Array<{
        child_id: string;
        hours_used: string | number;
        expires_at: string | null;
        packages:
          | { name_ar: string; name_en: string; coverage_type: 'unlimited' | 'hours_quota'; included_hours: number | null }
          | Array<{ name_ar: string; name_en: string; coverage_type: 'unlimited' | 'hours_quota'; included_hours: number | null }>
          | null;
      }>) {
        if (!result[row.child_id]) continue;
        const info = Array.isArray(row.packages) ? row.packages[0] : row.packages;
        if (!info) continue;
        result[row.child_id].extraHours = {
          packageNameAr: info.name_ar,
          packageNameEn: info.name_en,
          coverageType: info.coverage_type,
          includedHours: info.included_hours,
          hoursUsed: money(row.hours_used),
          expiresAt: row.expires_at,
        };
      }

      return result;
    },
    enabled: sortedIds.length > 0,
  });
}
