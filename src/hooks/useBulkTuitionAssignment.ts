import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminDealsKey } from '@/hooks/useAdminDeals';
import { tuitionPackagesKey } from '@/hooks/useAdminTuitionPackages';
import { supabase } from '@/lib/supabase';
import { formatQueryError } from '@/lib/utils';

import type { BillingPeriodKind } from './useAdminTuitionBillingPeriods';

export const bulkAssignChildrenKey = (nurseryId: string | null | undefined) => ['bulk-tuition-assign-children', nurseryId] as const;

export type BulkAssignChild = {
  id: string;
  nameAr: string;
  nameEn: string;
  classNameAr: string | null;
  classNameEn: string | null;
  hasParent: boolean;
  currentPackageAr: string | null;
  currentPackageEn: string | null;
};

/** 'next_period': first invoice after one billing period. 'immediate': first invoice issued today. */
export type BulkAssignEffective = 'next_period' | 'immediate';

export type BulkAssignResult = {
  succeeded: string[];
  failed: { childId: string; reason: string }[];
  invoicesIssued: number;
};

const CONCURRENCY = 4;

export function useBulkTuitionAssignment(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = bulkAssignChildrenKey(nurseryId);

  const childrenQuery = useQuery({
    queryKey: key,
    enabled: Boolean(nurseryId),
    queryFn: async (): Promise<BulkAssignChild[]> => {
      if (!nurseryId) return [];
      const [childrenRes, classesRes, subsRes] = await Promise.all([
        supabase
          .from('children')
          .select('id, full_name_ar, full_name_en, class_id')
          .eq('nursery_id', nurseryId)
          .eq('status', 'active')
          .order('full_name_en'),
        supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', nurseryId),
        supabase
          .from('child_tuition_subscriptions')
          .select('child_id, tuition_package_name_ar, tuition_package_name_en')
          .eq('nursery_id', nurseryId)
          .eq('status', 'active'),
      ]);
      if (childrenRes.error) throw childrenRes.error;
      if (classesRes.error) throw classesRes.error;
      if (subsRes.error) throw subsRes.error;

      const children = (childrenRes.data ?? []) as Array<{ id: string; full_name_ar: string; full_name_en: string; class_id: string | null }>;
      const parentRes = children.length
        ? await supabase.from('parent_children').select('child_id').in('child_id', children.map((c) => c.id))
        : { data: [], error: null };
      if (parentRes.error) throw parentRes.error;

      const classes = new Map(
        ((classesRes.data ?? []) as Array<{ id: string; name_ar: string; name_en: string }>).map((c) => [c.id, c]),
      );
      const subs = new Map(
        ((subsRes.data ?? []) as Array<{ child_id: string; tuition_package_name_ar: string; tuition_package_name_en: string }>).map(
          (s) => [s.child_id, s],
        ),
      );
      const withParent = new Set(((parentRes.data ?? []) as Array<{ child_id: string }>).map((p) => p.child_id));

      return children.map((c) => {
        const cls = c.class_id ? classes.get(c.class_id) : undefined;
        const sub = subs.get(c.id);
        return {
          id: c.id,
          nameAr: c.full_name_ar,
          nameEn: c.full_name_en,
          classNameAr: cls?.name_ar ?? null,
          classNameEn: cls?.name_en ?? null,
          hasParent: withParent.has(c.id),
          currentPackageAr: sub?.tuition_package_name_ar ?? null,
          currentPackageEn: sub?.tuition_package_name_en ?? null,
        };
      });
    },
  });

  const assign = useMutation({
    mutationFn: async (args: {
      childIds: string[];
      tuitionPackageId: string;
      billingPeriod: BillingPeriodKind;
      effective: BulkAssignEffective;
      onProgress?: (done: number) => void;
    }): Promise<BulkAssignResult> => {
      const result: BulkAssignResult = { succeeded: [], failed: [], invoicesIssued: 0 };
      let done = 0;
      // Same server function as the per-child Billing tab; a few calls at a time keeps the
      // progress responsive without flooding the API.
      for (let i = 0; i < args.childIds.length; i += CONCURRENCY) {
        await Promise.all(
          args.childIds.slice(i, i + CONCURRENCY).map(async (childId) => {
            const { data, error } = await supabase.rpc('admin_set_child_tuition_subscription' as never, {
              p_child_id: childId,
              p_tuition_package_id: args.tuitionPackageId,
              p_billing_period: args.billingPeriod,
              p_effective: args.effective,
            } as never);
            if (error) {
              result.failed.push({ childId, reason: formatQueryError(error) });
            } else {
              result.succeeded.push(childId);
              if ((data as { invoiceId?: string | null } | null)?.invoiceId) result.invoicesIssued += 1;
            }
            done += 1;
            args.onProgress?.(done);
          }),
        );
      }
      return result;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: tuitionPackagesKey(nurseryId) });
      void queryClient.invalidateQueries({ queryKey: adminDealsKey(nurseryId) });
      void queryClient.invalidateQueries({ queryKey: ['admin-child-billing'] });
    },
  });

  return { childrenQuery, assign };
}
