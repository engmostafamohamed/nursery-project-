import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StockScope } from './kitchen';
import { fetchFamilyMealPlans, fetchMealPlans, fetchStock, fetchStockHistory, type MealPlansData } from './mealPlansApi';

export const mealPlanKeys = (nurseryId: string | null | undefined) => ['fnb', 'meal-plans', nurseryId] as const;
/** A section of a nursery's stock; ['fnb', 'stock', nurseryId] covers every section and month. */
export const stockKeys = (nurseryId: string | null | undefined, scope: StockScope) => ['fnb', 'stock', nurseryId, scope] as const;
export const stockHistoryKeys = (nurseryId: string | null | undefined, scope: StockScope, month: string) => ['fnb', 'stock', nurseryId, 'history', scope, month] as const;
export const kitchenKeys = (nurseryId: string | null | undefined) => stockKeys(nurseryId, 'kitchen');

export function useMealPlansData(nurseryId: string | null | undefined) {
  return useQuery({ queryKey: mealPlanKeys(nurseryId), queryFn: () => fetchMealPlans(nurseryId!), enabled: Boolean(nurseryId) });
}

export function useStock(nurseryId: string | null | undefined, scope: StockScope) {
  return useQuery({ queryKey: stockKeys(nurseryId, scope), queryFn: () => fetchStock(nurseryId!, scope), enabled: Boolean(nurseryId) });
}

export const useKitchenStock = (nurseryId: string | null | undefined) => useStock(nurseryId, 'kitchen');

export function useStockHistory(nurseryId: string | null | undefined, scope: StockScope, month: string) {
  return useQuery({ queryKey: stockHistoryKeys(nurseryId, scope, month), queryFn: () => fetchStockHistory(nurseryId!, month, scope), enabled: Boolean(nurseryId) });
}

/** A change to meal plans; the function's answer replaces the page's data. */
export function useMealPlanChange<TInput>(nurseryId: string | null | undefined, run: (input: TInput) => Promise<MealPlansData>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: (data) => queryClient.setQueryData(mealPlanKeys(nurseryId), data) });
}

/**
 * A change to the stock: every section and month of the nursery's stock is read again (the kitchen
 * and the warehouse show the same items), and the sales (a cancelled charge comes back).
 */
export function useKitchenChange<TInput, TResult = unknown>(nurseryId: string | null | undefined, run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fnb', 'stock', nurseryId] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-sales'] });
    },
  });
}

/** The signed-in parent's children's meal plans. */
export function useFamilyMealPlans(enabled: boolean) {
  return useQuery({ queryKey: ['fnb', 'family-meal-plans'], queryFn: fetchFamilyMealPlans, enabled });
}
