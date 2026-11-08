import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchFamilyMealPlans, fetchKitchenStock, fetchMealPlans, type KitchenData, type MealPlansData } from './mealPlansApi';

export const mealPlanKeys = (nurseryId: string | null | undefined) => ['fnb', 'meal-plans', nurseryId] as const;
export const kitchenKeys = (nurseryId: string | null | undefined) => ['fnb', 'kitchen', nurseryId] as const;

export function useMealPlansData(nurseryId: string | null | undefined) {
  return useQuery({ queryKey: mealPlanKeys(nurseryId), queryFn: () => fetchMealPlans(nurseryId!), enabled: Boolean(nurseryId) });
}

export function useKitchenStock(nurseryId: string | null | undefined) {
  return useQuery({ queryKey: kitchenKeys(nurseryId), queryFn: () => fetchKitchenStock(nurseryId!), enabled: Boolean(nurseryId) });
}

/** A change to meal plans; the function's answer replaces the page's data. */
export function useMealPlanChange<TInput>(nurseryId: string | null | undefined, run: (input: TInput) => Promise<MealPlansData>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: (data) => queryClient.setQueryData(mealPlanKeys(nurseryId), data) });
}

/** A change to kitchen stock; the function's answer replaces the page's data. */
export function useKitchenChange<TInput>(nurseryId: string | null | undefined, run: (input: TInput) => Promise<KitchenData>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: (data) => queryClient.setQueryData(kitchenKeys(nurseryId), data) });
}

/** The signed-in parent's children's meal plans. */
export function useFamilyMealPlans(enabled: boolean) {
  return useQuery({ queryKey: ['fnb', 'family-meal-plans'], queryFn: fetchFamilyMealPlans, enabled });
}
