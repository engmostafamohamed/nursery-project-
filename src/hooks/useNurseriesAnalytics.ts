import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Nursery } from '@/types/nursery';

export interface NurseryFilters {
  subscriptionStatus?: 'all' | 'trial' | 'active' | 'inactive' | 'cancelled' | 'deleted' | 'expired';
  subscriptionPlan?: 'all' | 'starter' | 'professional' | 'enterprise';
  searchQuery?: string;
}

export interface NurseryWithAnalytics extends Nursery {
  trial_ends_at: string | null;
  deleted_at: string | null;
  suspended_at: string | null;
  userCount: number;
  childCount: number;
  activeChildCount: number;
  invoiceCount: number;
  nursery_settings?: unknown;
}

export function useNurseriesAnalytics(filters: NurseryFilters = {}) {
  return useQuery<NurseryWithAnalytics[]>({
    queryKey: ['xo-admin', 'nurseries-analytics', filters],
    queryFn: async () => {
      let query = supabase
        .from('nurseries')
        .select(
          `
          *,
          nursery_settings(*)
        `,
        )
        .order('created_at', { ascending: false });

      if (filters.subscriptionStatus && filters.subscriptionStatus !== 'all') {
        query = query.eq('subscription_status', filters.subscriptionStatus);
      }

      if (filters.subscriptionPlan && filters.subscriptionPlan !== 'all') {
        query = query.eq('subscription_plan', filters.subscriptionPlan);
      }

      if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
        const q = filters.searchQuery.trim();
        query = query.or(`name_en.ilike.%${q}%,name_ar.ilike.%${q}%`);
      }

      const { data: nurseriesData, error } = await query;
      if (error) throw error;

      const nurseries = (nurseriesData ?? []) as Array<Nursery & { nursery_settings?: unknown }>;

      const withCounts = await Promise.all(
        nurseries.map(async (nursery) => {
          const { count: userCount, error: userError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('nursery_id', nursery.id);
          if (userError) throw userError;

          const { count: childCount, error: childError } = await supabase
            .from('children')
            .select('*', { count: 'exact', head: true })
            .eq('nursery_id', nursery.id);
          if (childError) throw childError;

          const { count: activeChildCount, error: activeChildError } = await supabase
            .from('children')
            .select('*', { count: 'exact', head: true })
            .eq('nursery_id', nursery.id)
            .eq('status', 'active');
          if (activeChildError) throw activeChildError;

          const { count: invoiceCount, error: invoiceError } = await supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true })
            .eq('nursery_id', nursery.id);
          if (invoiceError) throw invoiceError;

          return {
            ...nursery,
            trial_ends_at: (nursery as NurseryWithAnalytics).trial_ends_at ?? null,
            deleted_at: (nursery as NurseryWithAnalytics).deleted_at ?? null,
            suspended_at: (nursery as NurseryWithAnalytics).suspended_at ?? null,
            userCount: userCount ?? 0,
            childCount: childCount ?? 0,
            activeChildCount: activeChildCount ?? 0,
            invoiceCount: invoiceCount ?? 0,
          };
        }),
      );

      return withCounts;
    },
  });
}

