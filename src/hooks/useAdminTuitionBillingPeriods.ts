import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const tuitionBillingPeriodsKey = (tuitionPackageId: string | null | undefined) =>
  ['admin-tuition-billing-periods', tuitionPackageId] as const;

export type BillingPeriodKind = 'monthly' | 'quarterly' | 'half_annual' | 'annual';

export type TuitionBillingPeriodRow = {
  id: string;
  tuition_package_id: string;
  billing_period: BillingPeriodKind;
  duration_months: number;
  price: number;
  active: boolean;
};

export type TuitionBillingPeriodInput = {
  billing_period: BillingPeriodKind;
  duration_months: number;
  price: number;
  active: boolean;
};

export const BILLING_PERIODS: { key: BillingPeriodKind; label: string; defaultMonths: number }[] = [
  { key: 'monthly', label: 'Monthly', defaultMonths: 1 },
  { key: 'quarterly', label: 'Quarterly (3 months)', defaultMonths: 3 },
  { key: 'half_annual', label: 'Half-annual (6 months)', defaultMonths: 6 },
  { key: 'annual', label: 'Annual (12 months)', defaultMonths: 12 },
];

export type BillingPeriodRowState = TuitionBillingPeriodInput & {
  id?: string;
  /** False = price auto-tracks basePrice × duration; becomes true once edited by hand, so a
   * deliberate discount/override is never silently overwritten by a later price change. */
  touched: boolean;
};

/** Builds the 4 period rows from whatever's already saved (editing a package), falling back to
 * basePrice × duration defaults for any period with no saved row yet (including every period,
 * for a brand-new package that hasn't been saved at all — pass `existing: []`). */
export function billingPeriodRowsFromExisting(
  existing: TuitionBillingPeriodRow[],
  basePrice: number,
): Record<BillingPeriodKind, BillingPeriodRowState> {
  const found = new Map(existing.map((row) => [row.billing_period, row]));
  const next = {} as Record<BillingPeriodKind, BillingPeriodRowState>;
  for (const period of BILLING_PERIODS) {
    const row = found.get(period.key);
    next[period.key] = row
      ? {
          id: row.id,
          billing_period: row.billing_period,
          duration_months: row.duration_months,
          price: row.price,
          active: row.active,
          touched: true,
        }
      : {
          billing_period: period.key,
          duration_months: period.defaultMonths,
          price: Number((basePrice * period.defaultMonths).toFixed(2)),
          active: true,
          touched: false,
        };
  }
  return next;
}

/** Re-syncs every untouched row's price to the new basePrice — call this when the package's
 * own price field changes, so periods the admin hasn't customized keep tracking it live. */
export function resyncUntouchedBillingPeriods(
  rows: Record<BillingPeriodKind, BillingPeriodRowState>,
  basePrice: number,
): Record<BillingPeriodKind, BillingPeriodRowState> {
  let changed = false;
  const next = { ...rows };
  for (const period of BILLING_PERIODS) {
    const row = rows[period.key];
    if (!row.touched) {
      const computed = Number((basePrice * row.duration_months).toFixed(2));
      if (computed !== row.price) {
        next[period.key] = { ...row, price: computed };
        changed = true;
      }
    }
  }
  return changed ? next : rows;
}

/** CRUD for one tuition package's billing periods, scoped to that package for reads. `upsert`
 * takes its target package explicitly (not from this `tuitionPackageId` param) so it can be
 * called right after creating a brand-new package, using the id that insert just returned —
 * before this hook would ever be re-rendered with that id bound in. */
export function useAdminTuitionBillingPeriods(tuitionPackageId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = tuitionBillingPeriodsKey(tuitionPackageId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TuitionBillingPeriodRow[]> => {
      if (!tuitionPackageId) return [];
      const { data, error } = await supabase
        .from('tuition_package_billing_periods')
        .select('id, tuition_package_id, billing_period, duration_months, price, active')
        .eq('tuition_package_id', tuitionPackageId)
        .order('duration_months', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as Omit<TuitionBillingPeriodRow, 'price'>),
        price: Number(row.price ?? 0),
      })) as TuitionBillingPeriodRow[];
    },
    enabled: Boolean(tuitionPackageId),
  });

  const upsert = useMutation({
    mutationFn: async ({
      tuitionPackageId: targetPackageId,
      nurseryId: targetNurseryId,
      id,
      input,
    }: {
      tuitionPackageId: string;
      nurseryId: string;
      id?: string;
      input: TuitionBillingPeriodInput;
    }) => {
      if (id) {
        const { error } = await supabase.from('tuition_package_billing_periods').update(input as never).eq('id', id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('tuition_package_billing_periods').insert({
        ...input,
        tuition_package_id: targetPackageId,
        nursery_id: targetNurseryId,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: tuitionBillingPeriodsKey(variables.tuitionPackageId) }),
  });

  return { query, upsert };
}
