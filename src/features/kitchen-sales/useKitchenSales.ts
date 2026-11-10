import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fnbKeys } from '@/features/food-and-beverage/useMenu';

import { fetchClassExtras, fetchFamilyExtras, fetchKitchenSales, fetchMyKitchenAccount } from './kitchenSalesApi';

export const kitchenSalesKeys = {
  all: ['kitchen-sales'] as const,
  sales: (nurseryId: string | null | undefined, month: string) => ['kitchen-sales', 'sales', nurseryId, month] as const,
  family: () => ['kitchen-sales', 'family'] as const,
  classes: () => ['kitchen-sales', 'classes'] as const,
  mine: (month: string) => ['kitchen-sales', 'mine', month] as const,
};

export function useKitchenSales(nurseryId: string | null | undefined, month: string, enabled = true) {
  return useQuery({ queryKey: kitchenSalesKeys.sales(nurseryId, month), queryFn: () => fetchKitchenSales(nurseryId as string, month), enabled: enabled && Boolean(nurseryId) });
}
export const useFamilyExtras = () => useQuery({ queryKey: kitchenSalesKeys.family(), queryFn: fetchFamilyExtras });
export const useClassExtras = () => useQuery({ queryKey: kitchenSalesKeys.classes(), queryFn: fetchClassExtras });
export const useMyKitchenAccount = (month: string) => useQuery({ queryKey: kitchenSalesKeys.mine(month), queryFn: () => fetchMyKitchenAccount(month) });

/**
 * A kitchen sale or extra change: afterwards every sales view, the stock, the invoices and the
 * notifications are read again (a charge moves stock and money at once).
 */
export function useKitchenSale<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kitchenSalesKeys.all });
      void queryClient.invalidateQueries({ queryKey: fnbKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['parent-billing'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
