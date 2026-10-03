import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ApplicationExtraHoursPackageDeal = {
  id: string;
  nameAr: string;
  nameEn: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type ApplicationExtraHoursPackage = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  coverageType: 'unlimited' | 'hours_quota';
  includedHours: number | null;
  validityValue: number | null;
  validityUnit: 'months' | 'years' | null;
  /** Display only — this package is never invoiced at application time, so a deal here is
   * cosmetic (no charge to actually discount). */
  deal: ApplicationExtraHoursPackageDeal | null;
};

function money(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Whether a deal is currently claimable: active and inside its optional start/end window. */
export function isExtraHoursDealActive(
  deal: Pick<ApplicationExtraHoursPackageDeal, 'active' | 'startsAt' | 'endsAt'>,
): boolean {
  if (!deal.active) return false;
  const now = Date.now();
  if (deal.startsAt && new Date(deal.startsAt).getTime() > now) return false;
  if (deal.endsAt && new Date(deal.endsAt).getTime() <= now) return false;
  return true;
}

/** Cosmetic-only preview of the discounted price — mirrors the admin deal math, never charged. */
export function computeExtraHoursDisplayPrice(pkg: Pick<ApplicationExtraHoursPackage, 'price' | 'deal'>): {
  discountAmount: number;
  displayPrice: number;
  dealApplied: boolean;
} {
  const dealApplied = Boolean(pkg.deal && isExtraHoursDealActive(pkg.deal));
  let discountAmount = 0;
  if (dealApplied && pkg.deal) {
    discountAmount =
      pkg.deal.discountType === 'percentage'
        ? Math.round(pkg.price * pkg.deal.discountValue) / 100
        : pkg.deal.discountValue;
    discountAmount = Math.min(discountAmount, pkg.price);
  }
  return { discountAmount, displayPrice: Math.max(pkg.price - discountAmount, 0), dealApplied };
}

type Params = {
  applicationId?: string;
  nurseryId?: string;
};

export function useApplicationExtraHoursPackage({ applicationId, nurseryId }: Params) {
  const queryClient = useQueryClient();

  const packagesQuery = useQuery({
    queryKey: ['application-extra-hours-packages', nurseryId],
    queryFn: async (): Promise<ApplicationExtraHoursPackage[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('packages')
        .select(
          `id, name_ar, name_en, description_ar, description_en, coverage_type, included_hours, price, validity_value, validity_unit,
          deals (id, name_ar, name_en, discount_type, discount_value, starts_at, ends_at, active)`,
        )
        .eq('nursery_id', nurseryId)
        .eq('active', true)
        .order('price', { ascending: true });
      if (error) throw error;
      type DealRow = {
        id: string;
        name_ar: string;
        name_en: string;
        discount_type: 'percentage' | 'fixed_amount';
        discount_value: string | number;
        starts_at: string | null;
        ends_at: string | null;
        active: boolean;
      };
      return ((data ?? []) as Array<{
        id: string;
        name_ar: string;
        name_en: string;
        description_ar: string | null;
        description_en: string | null;
        coverage_type: 'unlimited' | 'hours_quota';
        included_hours: number | null;
        price: string | number;
        validity_value: number | null;
        validity_unit: 'months' | 'years' | null;
        deals: DealRow | DealRow[] | null;
      }>).map((row) => {
        const dealRow = Array.isArray(row.deals) ? row.deals[0] : row.deals;
        return {
          id: row.id,
          nameAr: row.name_ar,
          nameEn: row.name_en,
          descriptionAr: row.description_ar,
          descriptionEn: row.description_en,
          coverageType: row.coverage_type,
          includedHours: row.included_hours,
          price: money(row.price),
          validityValue: row.validity_value,
          validityUnit: row.validity_unit,
          deal: dealRow
            ? {
                id: dealRow.id,
                nameAr: dealRow.name_ar,
                nameEn: dealRow.name_en,
                discountType: dealRow.discount_type,
                discountValue: money(dealRow.discount_value),
                startsAt: dealRow.starts_at,
                endsAt: dealRow.ends_at,
                active: dealRow.active,
              }
            : null,
        };
      });
    },
    enabled: Boolean(nurseryId),
  });

  const selectPackage = useMutation({
    mutationFn: async (packageId: string | null) => {
      if (!applicationId) throw new Error('Missing application');
      const { error } = await supabase.rpc('select_application_extra_hours_package' as never, {
        p_application_id: applicationId,
        p_package_id: packageId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['application-detail'] });
    },
  });

  return {
    packages: packagesQuery.data ?? [],
    isLoading: packagesQuery.isLoading,
    selectPackage: (packageId: string | null) => selectPackage.mutateAsync(packageId),
    isSelecting: selectPackage.isPending,
  };
}
