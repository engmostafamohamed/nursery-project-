import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, subMonths } from 'date-fns';

import { supabase } from '@/lib/supabase';

interface MonthlyData {
  month: string;
  count: number;
}

export interface PlatformAnalytics {
  monthlySignups: MonthlyData[];
  planDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
}

interface NurserySignupRow {
  created_at: string;
  subscription_plan: string | null;
  subscription_status: string | null;
}

export function usePlatformAnalytics() {
  return useQuery<PlatformAnalytics>({
    queryKey: ['xo-admin', 'platform-analytics'],
    queryFn: async () => {
      const { data } = await supabase
        .from('nurseries')
        .select('created_at, subscription_plan, subscription_status')
        .order('created_at', { ascending: true });

      const nurseries = (data ?? []) as NurserySignupRow[];

      const monthlySignups: MonthlyData[] = [];
      for (let i = 11; i >= 0; i -= 1) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthLabel = format(monthStart, 'MMM');

        const count = nurseries.filter((n) => {
          const createdMonth = startOfMonth(new Date(n.created_at));
          return createdMonth.getTime() === monthStart.getTime();
        }).length;

        monthlySignups.push({ month: monthLabel, count });
      }

      const planDistribution = nurseries.reduce<Record<string, number>>((acc, n) => {
        const plan = n.subscription_plan ?? 'none';
        acc[plan] = (acc[plan] ?? 0) + 1;
        return acc;
      }, {});

      const statusDistribution = nurseries.reduce<Record<string, number>>((acc, n) => {
        const status = n.subscription_status ?? 'none';
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      }, {});

      return {
        monthlySignups,
        planDistribution,
        statusDistribution,
      };
    },
  });
}

