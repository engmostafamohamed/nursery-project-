import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

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
};

function money(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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
        .select('id, name_ar, name_en, description_ar, description_en, coverage_type, included_hours, price, validity_value, validity_unit')
        .eq('nursery_id', nurseryId)
        .eq('active', true)
        .order('price', { ascending: true });
      if (error) throw error;
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
      }>).map((row) => ({
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
      }));
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
